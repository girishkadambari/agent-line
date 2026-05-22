/**
 * test-voice-flows.ts
 *
 * Smoke-tests the two voice agent modes end-to-end against the running agent-line
 * internal API (http://localhost:3000/v1).
 *
 * Usage:
 *   npx tsx scripts/test-voice-flows.ts
 *
 * What it does:
 *   1. Ensures seed data exists (workspace / project / agent records).
 *   2. Creates a temporary Call record for each test (hosted + webhook).
 *   3. Calls POST /v1/internal/voice/calls/:sid/turn and streams NDJSON.
 *   4. Prints each chunk as it arrives so you can see streaming in action.
 *   5. Optionally starts a tiny local webhook server (--webhook flag) so you
 *      can test the webhook flow without an external URL.
 *   6. Cleans up the temporary call records.
 *
 * Prerequisites:
 *   - agent-line running on http://localhost:3000
 *   - VUKHO_INTERNAL_SECRET=dev-secret-change-in-prod (default)
 */

import { PrismaClient } from '@prisma/client';
import { createServer } from 'node:http';
import { createId } from '../src/common/ids';

const BASE_URL = process.env.AGENT_LINE_URL ?? 'http://localhost:3000/v1';
const SECRET = process.env.VUKHO_INTERNAL_SECRET ?? 'dev-secret-change-in-prod';
const WORKSPACE_ID = 'ws_local';
const PROJECT_ID = 'proj_local';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postTurn(callSid: string, transcript: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/internal/voice/calls/${callSid}/turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vukho-secret': SECRET,
    },
    body: JSON.stringify({ transcript }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let chunkIndex = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuffer += decoder.decode(value, { stream: true });
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as { text: string; interim: boolean };
      const tag = chunk.interim ? 'INTERIM' : 'FINAL  ';
      console.log(`  [${String(++chunkIndex).padStart(2, '0')}] ${tag} → "${chunk.text}"`);
    }
  }
}

async function ensureCallRecord(agentId: string, callSid: string): Promise<void> {
  const existing = await prisma.call.findFirst({ where: { providerCallId: callSid } });
  if (existing) return;

  // Ensure a contact exists
  let contact = await prisma.contact.findFirst({ where: { projectId: PROJECT_ID, phoneNumber: '+15550000001' } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        id: createId('con'),
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        phoneNumber: '+15550000001',
      },
    });
  }

  // Ensure a conversation exists
  let conversation = await prisma.conversation.findFirst({
    where: { agentId, contactId: contact.id, channel: 'voice' },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        id: createId('conv'),
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        agentId,
        contactId: contact.id,
        channel: 'voice',
        status: 'active',
        lastActivityAt: new Date(),
      },
    });
  }

  await prisma.call.create({
    data: {
      id: createId('call'),
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      agentId,
      conversationId: conversation.id,
      contactId: contact.id,
      direction: 'inbound',
      fromNumber: '+15550000001',
      toNumber: '+15550000099',
      status: 'in_progress',
      provider: 'twilio',
      providerCallId: callSid,
      startedAt: new Date(),
    },
  });
}

async function cleanup(callSid: string): Promise<void> {
  const call = await prisma.call.findFirst({ where: { providerCallId: callSid } });
  if (call) {
    await prisma.transcriptTurn.deleteMany({ where: { callId: call.id } });
    await prisma.call.delete({ where: { id: call.id } });
  }
}

// ---------------------------------------------------------------------------
// Webhook test server
// ---------------------------------------------------------------------------

function startWebhookServer(port: number): Promise<{ url: string; stop: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        console.log(`  [webhook] received: transcript="${parsed.transcript}"`);
        const sig = req.headers['x-vukho-signature'];
        console.log(`  [webhook] signature: ${sig}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: `Echo from webhook: "${parsed.transcript}"` }));
      });
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      resolve({
        url,
        stop: () => { server.close(); },
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runWebhook = process.argv.includes('--webhook');
  const WEBHOOK_PORT = 9876;

  console.log('='.repeat(60));
  console.log('  Vukho Voice Flow Smoke Test');
  console.log(`  agent-line: ${BASE_URL}`);
  console.log('='.repeat(60));

  // ---- Test 1: Hosted (Anthropic streaming) --------------------------------
  {
    const callSid = `test_hosted_${Date.now()}`;
    console.log('\n▶ Test 1 — HOSTED mode (Anthropic streaming)');
    console.log(`  callSid : ${callSid}`);
    console.log(`  agent   : agt_scheduler (hosted)`);

    const agent = await prisma.agent.findFirst({ where: { id: 'agt_scheduler' } });
    if (!agent) {
      console.error('  ✗ agt_scheduler not found — run: npm run db:seed');
      process.exit(1);
    }

    await ensureCallRecord('agt_scheduler', callSid);

    try {
      console.log(`  transcript: "What time is my appointment tomorrow?"`);
      console.log('  streaming chunks:');
      const t0 = Date.now();
      await postTurn(callSid, 'What time is my appointment tomorrow?');
      console.log(`  ✓ done in ${Date.now() - t0}ms`);
    } catch (err) {
      console.error(`  ✗ error: ${err instanceof Error ? err.message : err}`);
    } finally {
      await cleanup(callSid);
    }
  }

  // ---- Test 2: Webhook mode -----------------------------------------------
  {
    const callSid = `test_webhook_${Date.now()}`;
    console.log('\n▶ Test 2 — WEBHOOK mode');
    console.log(`  callSid : ${callSid}`);

    // Spin up a local webhook server if requested, otherwise use the seed URL.
    let webhookServer: { url: string; stop: () => void } | null = null;
    let webhookUrl: string;

    if (runWebhook) {
      webhookServer = await startWebhookServer(WEBHOOK_PORT);
      webhookUrl = webhookServer.url;
      // Patch agent webhook URL temporarily for this run.
      await prisma.agent.update({
        where: { id: 'agt_support' },
        data: { webhookUrl },
      });
      console.log(`  local webhook server: ${webhookUrl}`);
    } else {
      const agent = await prisma.agent.findFirst({ where: { id: 'agt_support' } });
      webhookUrl = agent?.webhookUrl ?? 'https://example.com/vukho/webhook';
      console.log(`  webhook URL: ${webhookUrl}`);
      console.log('  tip: run with --webhook flag for a live local webhook server');
    }

    await ensureCallRecord('agt_support', callSid);

    try {
      console.log(`  transcript: "I need help with my order"`);
      console.log('  streaming chunks:');
      const t0 = Date.now();
      await postTurn(callSid, 'I need help with my order');
      console.log(`  ✓ done in ${Date.now() - t0}ms`);
    } catch (err) {
      console.error(`  ✗ error: ${err instanceof Error ? err.message : err}`);
    } finally {
      if (webhookServer) {
        // Restore original webhook URL.
        await prisma.agent.update({
          where: { id: 'agt_support' },
          data: { webhookUrl: 'https://example.com/vukho/webhook' },
        });
        webhookServer.stop();
      }
      await cleanup(callSid);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  Done. For a full Twilio call test see TESTING.md');
  console.log('='.repeat(60) + '\n');
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
