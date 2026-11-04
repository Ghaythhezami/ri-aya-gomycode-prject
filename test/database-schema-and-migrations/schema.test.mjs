// Schema-level guarantees for BP-002 (database-schema-and-migrations).
//
// AC-001, AC-005 and AC-009 are assertions about the source of truth itself - the
// Prisma schema and the ERD - so they are checked against the text rather than against
// a migrated database. That makes them runnable on any machine, including CI without
// Docker, and it keeps them honest about the thing later features actually copy from.
//
// Run: node --test test/database-schema-and-migrations
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { prismaDir, projectRoot } from './helpers.mjs';

const schema = fs.readFileSync(path.join(prismaDir, 'schema.prisma'), 'utf8');
const erd = fs.readFileSync(path.join(prismaDir, 'ERD.md'), 'utf8');

/** The body of one `model X { ... }` block, so assertions cannot leak across models. */
function modelBlock(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `schema.prisma must declare model ${name}`);

  return match[1];
}

test('TEST-001 AC-001: the clinical models exist and are clinic scoped', () => {
  for (const name of ['Patient', 'Doctor', 'Appointment']) {
    const block = modelBlock(name);

    assert.match(block, /clinicId\s+String/, `${name} must carry clinicId`);
    // A column called clinicId is not tenant scoping; the foreign key is.
    assert.match(
      block,
      /clinic\s+Clinic\s+@relation\(fields: \[clinicId\], references: \[id\]/,
      `${name}.clinicId must be a foreign key to Clinic`,
    );
  }
});

test('TEST-002 AC-001: an appointment belongs to both a patient and a doctor', () => {
  const appointment = modelBlock('Appointment');

  assert.match(
    appointment,
    /patient\s+Patient\s+@relation\(fields: \[patientId\], references: \[id\]/,
    'Appointment must reference Patient',
  );
  assert.match(
    appointment,
    /doctor\s+Doctor\s+@relation\(fields: \[doctorId\], references: \[id\]/,
    'Appointment must reference Doctor',
  );
});

test('TEST-003 AC-005: the two hot access paths are indexed', () => {
  const appointment = modelBlock('Appointment');

  assert.match(appointment, /@@index\(\[doctorId, startsAt\]\)/, 'a doctor\'s day needs (doctorId, startsAt)');
  assert.match(appointment, /@@index\(\[patientId\]\)/, 'a patient\'s history needs (patientId)');
});

test('TEST-004 AC-009: the ERD documents the clinical models and their relations', () => {
  for (const entity of ['PATIENT', 'DOCTOR', 'APPOINTMENT', 'CLINIC']) {
    assert.match(erd, new RegExp(`\\b${entity}\\b`), `the ERD must show ${entity}`);
  }

  // Relationships, not just entity names.
  assert.match(erd, /CLINIC \|\|--o\{ PATIENT/, 'the ERD must relate CLINIC to PATIENT');
  assert.match(erd, /DOCTOR \|\|--o\{ APPOINTMENT/, 'the ERD must relate DOCTOR to APPOINTMENT');
  assert.match(erd, /PATIENT \|\|--o\{ APPOINTMENT/, 'the ERD must relate PATIENT to APPOINTMENT');

  // The index strategy is part of what later features must honour.
  assert.match(erd, /\(doctorId, startsAt\)/, 'the ERD must name the doctor-day index');
  assert.match(erd, /\(patientId\)/, 'the ERD must name the patient-history index');
});

test('TEST-005 AC-009: the ERD points at the schema as its source of truth', () => {
  assert.match(erd, /schema\.prisma/, 'the ERD must reference schema.prisma');

  // A diagram that has drifted from the schema is worse than none, so the file that
  // documents the models has to live next to them.
  assert.ok(fs.existsSync(path.join(projectRoot, 'server', 'prisma', 'ERD.md')));
});
