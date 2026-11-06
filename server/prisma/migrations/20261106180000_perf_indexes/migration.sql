-- Performance indexes (additive only). Targets: patient visit lookups
-- (lastVisit / nextAppointment), appointment lists filtered by status and day,
-- the waiting-room queue, chat conversation lists and the audit-log entity filter.

-- CreateIndex
CREATE INDEX "appointments_clinicId_patientId_startsAt_idx" ON "appointments"("clinicId", "patientId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_clinicId_status_startsAt_idx" ON "appointments"("clinicId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "queue_entries_clinicId_status_checkedInAt_idx" ON "queue_entries"("clinicId", "status", "checkedInAt");

-- CreateIndex
CREATE INDEX "chat_conversations_clinicId_updatedAt_idx" ON "chat_conversations"("clinicId", "updatedAt");

-- CreateIndex
CREATE INDEX "chat_conversations_memberIds_idx" ON "chat_conversations" USING GIN ("memberIds");

-- CreateIndex
CREATE INDEX "audit_logs_clinicId_entity_createdAt_idx" ON "audit_logs"("clinicId", "entity", "createdAt");
