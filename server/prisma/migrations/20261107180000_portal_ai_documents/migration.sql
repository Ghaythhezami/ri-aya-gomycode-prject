-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'STAFF';

-- AlterTable
ALTER TABLE "clinic_settings" ADD COLUMN     "aiAssistantsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "patientPortalEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "patientSelfRegistration" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "possibleDuplicateOfId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'STAFF';

-- CreateTable
CREATE TABLE "patient_accounts" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "preferredLocale" TEXT NOT NULL DEFAULT 'en',
    "emailVerifiedAt" TIMESTAMP(3),
    "aiConsentAt" TIMESTAMP(3),
    "privacyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "onboardingCompletedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_refresh_tokens" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_invites" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_documents" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT 'STAFF',
    "uploaderId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "category" TEXT,
    "documentDate" TIMESTAMP(3),
    "extractedText" TEXT,
    "extraction" JSONB,
    "summary" TEXT,
    "errorCode" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_summaries" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "patientContent" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "visibleToPatient" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "title" TEXT,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_accounts_patientId_key" ON "patient_accounts"("patientId");

-- CreateIndex
CREATE INDEX "patient_accounts_clinicId_idx" ON "patient_accounts"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_accounts_clinicId_email_key" ON "patient_accounts"("clinicId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "patient_refresh_tokens_tokenHash_key" ON "patient_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "patient_refresh_tokens_accountId_idx" ON "patient_refresh_tokens"("accountId");

-- CreateIndex
CREATE INDEX "patient_refresh_tokens_familyId_idx" ON "patient_refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_invites_tokenHash_key" ON "patient_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "patient_invites_patientId_idx" ON "patient_invites"("patientId");

-- CreateIndex
CREATE INDEX "patient_documents_clinicId_patientId_createdAt_idx" ON "patient_documents"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "patient_documents_patientId_sha256_key" ON "patient_documents"("patientId", "sha256");

-- CreateIndex
CREATE INDEX "patient_summaries_clinicId_patientId_createdAt_idx" ON "patient_summaries"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_conversations_clinicId_actorType_actorId_updatedAt_idx" ON "ai_conversations"("clinicId", "actorType", "actorId", "updatedAt");

-- AddForeignKey
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_refresh_tokens" ADD CONSTRAINT "patient_refresh_tokens_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "patient_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_summaries" ADD CONSTRAINT "patient_summaries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

