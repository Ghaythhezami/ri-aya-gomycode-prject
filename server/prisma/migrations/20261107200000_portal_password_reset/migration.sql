-- CreateTable
CREATE TABLE "patient_password_reset_tokens" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_password_reset_tokens_tokenHash_key" ON "patient_password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "patient_password_reset_tokens_accountId_idx" ON "patient_password_reset_tokens"("accountId");

-- AddForeignKey
ALTER TABLE "patient_password_reset_tokens" ADD CONSTRAINT "patient_password_reset_tokens_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "patient_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
