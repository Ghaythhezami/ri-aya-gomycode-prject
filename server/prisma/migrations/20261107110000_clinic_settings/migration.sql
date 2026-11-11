-- BP-035: clinic settings for the settings screen.
-- Contact details plus weekly operating hours, stored as one JSON document so a
-- day's open/closed state, times and breaks stay together.
ALTER TABLE "clinics" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "clinics" ADD COLUMN "phone" TEXT;
ALTER TABLE "clinics" ADD COLUMN "defaultLanguage" "PreferredLocale" NOT NULL DEFAULT 'en';
ALTER TABLE "clinics" ADD COLUMN "workingHours" JSONB;
