/**
 * Real-database concurrency check (not part of the jest run).
 *
 *   npx ts-node scripts/concurrency-check.ts [apiBase]
 *
 * Logs in as the seeded receptionist, finds a free future slot, fires 50 parallel
 * POST /appointments for it and asserts exactly one 201 and 49 conflicts
 * (SLOT_CONFLICT or SLOT_LOCKED), then marks the created booking NO_SHOW.
 */
const BASE = process.argv[2] ?? 'http://localhost:4000/api';
const PARALLEL = 50;

type Json = Record<string, any>;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const login = await call('POST', '/auth/login', undefined, {
    email: 'receptionist@riaya.local',
    password: 'RiayaReception123!',
  });
  const token = (login.json.accessToken ?? login.json.access_token) as string | undefined;
  if (!token) fail(`login failed (${login.status}): ${JSON.stringify(login.json)}`);

  const doctors = await call('GET', '/doctors', token);
  const doctor = (doctors.json as Json[]).find((d) => d.isActive && d.hoursLabel);
  if (!doctor) fail('no active doctor with hours');

  const patients = await call('GET', '/patients?limit=1', token);
  const patient = patients.json.items?.[0];
  if (!patient) fail('no patient');

  // First free slot in the next 14 days.
  let slot: Json | undefined;
  for (let offset = 1; offset <= 14 && !slot; offset++) {
    const date = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const slots = await call('GET', `/doctors/${doctor.id}/slots?date=${date}`, token);
    slot = (slots.json as Json[]).find((s) => s.available);
  }
  if (!slot) fail('no free slot found');
  console.log(`Target: ${doctor.name} at ${slot.startsAt}`);

  const payload = {
    patientId: patient.id,
    doctorId: doctor.id,
    startsAt: slot.startsAt,
    type: 'CONSULTATION',
    reason: 'concurrency check',
  };
  const results = await Promise.all(
    Array.from({ length: PARALLEL }, () => call('POST', '/appointments', token, payload)),
  );

  const created = results.filter((r) => r.status === 201);
  const conflicts = results.filter(
    (r) => r.status === 409 && ['SLOT_CONFLICT', 'SLOT_LOCKED'].includes(r.json.code),
  );
  const other = results.filter((r) => !created.includes(r) && !conflicts.includes(r));
  console.log(`201: ${created.length}, 409: ${conflicts.length}, other: ${other.length}`);
  if (other.length) console.log('other responses:', JSON.stringify(other.slice(0, 3)));

  if (created.length !== 1) fail(`expected exactly 1 created, got ${created.length}`);
  if (conflicts.length !== PARALLEL - 1) fail(`expected ${PARALLEL - 1} conflicts`);
  const withAlternatives = conflicts.filter(
    (r) => r.json.code !== 'SLOT_CONFLICT' || Array.isArray(r.json.details?.alternatives),
  );
  if (withAlternatives.length !== conflicts.length) fail('a SLOT_CONFLICT lacked alternatives');
  const sample = conflicts.find((r) => r.json.code === 'SLOT_CONFLICT');
  console.log('alternatives sample:', JSON.stringify(sample?.json.details?.alternatives ?? []));
  if (!sample?.json.details?.alternatives?.length) fail('no alternatives were offered');

  // Release the slot again so the check can be repeated.
  const id = created[0]!.json.id as string;
  const cancelled = await call('POST', `/appointments/${id}/status`, token, { status: 'NO_SHOW' });
  console.log(`cleanup (NO_SHOW): ${cancelled.status}`);
  console.log('PASS: 1 x 201 and 49 x 409 with alternatives');
}

main().catch((error) => fail(String(error)));
