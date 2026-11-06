-- AlterTable: appointment types become per-clinic rows; convert the enum column in place
-- (no data loss) instead of dropping it.
ALTER TABLE "appointments" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "appointments" ALTER COLUMN "type" SET DEFAULT 'CONSULTATION';

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "nameI18n" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "firstNameI18n" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "lastNameI18n" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "roleId" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "firstNameI18n" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "lastNameI18n" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "nameI18n" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "user_memberships" ADD COLUMN     "roleId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "firstNameI18n" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastNameI18n" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT;

-- DropEnum
DROP TYPE "AppointmentType";

-- CreateTable
CREATE TABLE "clinic_roles" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL DEFAULT '{}',
    "baseRole" "UserRole" NOT NULL,
    "capabilities" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_types" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'primary',
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinic_roles_clinicId_key_key" ON "clinic_roles"("clinicId", "key");

-- CreateIndex
CREATE INDEX "appointment_types_clinicId_isActive_idx" ON "appointment_types"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_types_clinicId_code_key" ON "appointment_types"("clinicId", "code");

-- CreateIndex
CREATE INDEX "user_memberships_roleId_idx" ON "user_memberships"("roleId");

-- AddForeignKey
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "clinic_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "clinic_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_roles" ADD CONSTRAINT "clinic_roles_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_types" ADD CONSTRAINT "appointment_types_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: the three system appointment types for every clinic, with the durations the
-- clinic already configured (settings.durations), falling back to 30 / 15 / 20 minutes.
INSERT INTO "appointment_types" ("id", "clinicId", "code", "name", "durationMinutes", "color", "isEmergency", "isSystem", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, c."id", t.code, t.name::jsonb,
       COALESCE(NULLIF(s."durations"->>t.code, '')::int, t.minutes),
       t.color, t.emergency, true, t.sort, CURRENT_TIMESTAMP
FROM "clinics" c
LEFT JOIN "clinic_settings" s ON s."clinicId" = c."id"
CROSS JOIN (VALUES
  ('CONSULTATION', '{"en":"Consultation","fr":"Consultation","ar":"استشارة"}', 30, 'primary', false, 0),
  ('FOLLOW_UP', '{"en":"Follow-up","fr":"Suivi","ar":"متابعة"}', 15, 'info', false, 1),
  ('EMERGENCY', '{"en":"Emergency","fr":"Urgence","ar":"طوارئ"}', 20, 'alert', true, 2)
) AS t(code, name, minutes, color, emergency, sort)
ON CONFLICT ("clinicId", "code") DO NOTHING;

-- Patient search over canonical and per-language names, code and phone.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
UPDATE "patients" SET "searchText" = lower(concat_ws(' ', "firstName", "lastName", "code", "phone", "email"));
CREATE INDEX "patients_searchText_trgm_idx" ON "patients" USING gin ("searchText" gin_trgm_ops);
