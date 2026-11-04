-- D5: a refresh token must remember the workspace it was issued for, so a
-- refresh after a workspace switch cannot silently fall back to the default
-- clinic. Nullable so existing rows remain valid; a null row falls back once.
ALTER TABLE "refresh_tokens" ADD COLUMN "clinicId" TEXT;
