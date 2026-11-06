-- Shared security state for deployments without Redis (ADR 0001). Additive only.
CREATE TABLE IF NOT EXISTS "security_state" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_state_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "security_state_expiresAt_idx" ON "security_state"("expiresAt");
