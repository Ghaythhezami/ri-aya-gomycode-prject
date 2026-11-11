-- BP-047 / FR-042 / FR-041: invitation lifecycle and delivery outcome.
-- `EXPIRED` is deliberately NOT an enum member: it is derived at read time for a
-- PENDING row whose "expiresAt" has passed, so the persisted status stays the
-- single source of truth and no scheduler is required.
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- Existing rows default to PENDING/PENDING; a consumed row is already accepted.
ALTER TABLE "invitations" ADD COLUMN "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "invitations" ADD COLUMN "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "invitations" ADD COLUMN "deliveryError" TEXT;
ALTER TABLE "invitations" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: a row that was already consumed is ACCEPTED, not PENDING.
UPDATE "invitations" SET "status" = 'ACCEPTED' WHERE "consumedAt" IS NOT NULL;

CREATE INDEX "invitations_clinicId_status_idx" ON "invitations"("clinicId", "status");
