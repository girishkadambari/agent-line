-- AlterTable: add tier and sttAccuracy columns to Agent
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "tier" TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "sttAccuracy" TEXT;
