import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import type { Call, TranscriptTurn } from '@prisma/client';
import { EventEmitter } from 'node:events';
import { Observable } from 'rxjs';

import type { RequestContext } from '../../common/context/request-context';
import { serializeTranscriptTurn } from './calls.serializer';

type TranscriptStreamEvent =
  | { event: 'turn'; data: ReturnType<typeof serializeTranscriptTurn> }
  | { event: 'ended'; data: { callId: string; status: string } }
  | { event: 'heartbeat'; data: { callId: string; timestamp: string } };

@Injectable()
export class CallTranscriptStreamService implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private readonly heartbeatMs = 15_000;

  stream(
    context: RequestContext,
    callId: string,
    replayTurns: Array<ReturnType<typeof serializeTranscriptTurn>>,
  ): Observable<MessageEvent> {
    const eventName = this.eventName(context, callId);

    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ type: 'connected', data: { callId } });
      replayTurns.forEach((turn) => subscriber.next({ type: 'turn', data: turn }));

      const listener = (event: TranscriptStreamEvent) => {
        subscriber.next({ type: event.event, data: event.data });
      };
      const heartbeat = setInterval(() => {
        subscriber.next({
          type: 'heartbeat',
          data: { callId, timestamp: new Date().toISOString() },
        });
      }, this.heartbeatMs);

      this.emitter.on(eventName, listener);

      return () => {
        clearInterval(heartbeat);
        this.emitter.off(eventName, listener);
      };
    });
  }

  publishTurn(call: Pick<Call, 'workspaceId' | 'projectId' | 'id'>, turn: TranscriptTurn) {
    this.emitter.emit(this.eventName(call, call.id), {
      event: 'turn',
      data: serializeTranscriptTurn(turn),
    } satisfies TranscriptStreamEvent);
  }

  publishEnded(call: Pick<Call, 'workspaceId' | 'projectId' | 'id' | 'status'>) {
    this.emitter.emit(this.eventName(call, call.id), {
      event: 'ended',
      data: { callId: call.id, status: call.status },
    } satisfies TranscriptStreamEvent);
  }

  onModuleDestroy() {
    this.emitter.removeAllListeners();
  }

  private eventName(context: Pick<RequestContext, 'workspaceId' | 'projectId'>, callId: string) {
    return `${context.workspaceId}:${context.projectId}:${callId}`;
  }
}
