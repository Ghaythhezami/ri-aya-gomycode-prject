// AC-005 and AC-007 — the committed configuration is complete and safe to share.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const tracked = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

test("TEST-004 AC-005: no .env is tracked, and every .env.example is", () => {
  const trackedEnv = tracked.filter((file) => /(^|\/)\.env(\.[^/]+)?$/.test(file) && !file.endsWith(".example"));

  assert.deepEqual(trackedEnv, [], `these .env files must never be committed: ${trackedEnv.join(", ")}`);

  for (const example of ["server/.env.example", "web/.env.example", "backoffice/.env.example"]) {
    assert.equal(tracked.includes(example), true, `${example} must stay tracked`);
  }
});

test("TEST-006 AC-007: server/.env.example documents the keys the server reads and holds no real credential", () => {
  const contents = readFileSync(join(REPO_ROOT, "server", ".env.example"), "utf8");
  const keys = contents
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => line.split("=")[0].trim());

  for (const required of ["DATABASE_URL", "REDIS_URL", "MONGO_URL", "JWT_ACCESS_SECRET", "COOKIE_SECURE"]) {
    assert.equal(keys.includes(required), true, `server/.env.example must document ${required}`);
  }

  assert.match(contents, /^MONGO_URL=mongodb:\/\/localhost:27017\/riaya$/m);

  // No real secret shapes, and the JWT secret is an obvious placeholder.
  for (const pattern of [/AKIA[0-9A-Z]{16}/, /BEGIN [A-Z ]*PRIVATE KEY/, /sk_live_/, /ghp_[A-Za-z0-9]{20,}/]) {
    assert.equal(pattern.test(contents), false, `server/.env.example must not contain ${pattern}`);
  }

  const jwt = contents.match(/^JWT_ACCESS_SECRET=(.*)$/m)?.[1] ?? "";
  assert.match(jwt, /change-me/, "the JWT secret must be a placeholder, not a usable secret");
});
