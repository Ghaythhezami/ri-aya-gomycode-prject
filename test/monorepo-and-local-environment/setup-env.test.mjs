// AC-003 and AC-004 — scripts/setup-env.mjs behaviour.
//
// Each test runs the REAL script against a throwaway fixture so that a bug in the
// script shows up here, not against the developer's own .env files.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "setup-env.mjs");

function fixture(packages = {}) {
  const dir = mkdtempSync(join(tmpdir(), "riaya-setup-"));

  for (const [pkg, files] of Object.entries(packages)) {
    mkdirSync(join(dir, pkg), { recursive: true });
    if (files.example) writeFileSync(join(dir, pkg, ".env.example"), files.example);
    if (files.env) writeFileSync(join(dir, pkg, ".env"), files.env);
  }

  return dir;
}

function run(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
}

const EXAMPLE = "DATABASE_URL=postgresql://local/dev\nMONGO_URL=mongodb://localhost:27017/dev\n";

test("AC-003: setup-env is idempotent and never rewrites an existing .env", () => {
  const dir = fixture({
    server: { example: EXAMPLE, env: "DATABASE_URL=my-own-value\n" },
    web: { example: EXAMPLE, env: "KEEP=1\n" },
    backoffice: { example: EXAMPLE, env: "KEEP=2\n" }
  });

  const before = ["server", "web", "backoffice"].map((pkg) =>
    readFileSync(join(dir, pkg, ".env"), "utf8")
  );

  const first = run(dir);
  assert.equal(first.status, 0, `first run exited ${first.status}: ${first.stderr}`);

  const afterFirst = ["server", "web", "backoffice"].map((pkg) =>
    readFileSync(join(dir, pkg, ".env"), "utf8")
  );
  assert.deepEqual(afterFirst, before, "an existing .env must be byte-identical after a run");

  const second = run(dir);
  assert.equal(second.status, 0);
  assert.equal(second.stdout.includes("0 created"), true, `second run should create nothing: ${second.stdout}`);
  assert.equal(second.stdout.includes("3 skipped"), true, `second run should skip all three: ${second.stdout}`);
});

test("AC-004: setup-env creates a missing .env from its example and reports created, skipped and missing", () => {
  const dir = fixture({
    server: { example: EXAMPLE, env: "DATABASE_URL=already-here\n" },
    // web has an example but no .env -> must be created
    web: { example: EXAMPLE },
    // backoffice has neither -> reported as a missing example, run still succeeds
    backoffice: {}
  });

  const result = run(dir);
  assert.equal(result.status, 0, `expected exit 0 even with a missing example: ${result.stderr}`);

  assert.equal(existsSync(join(dir, "web", ".env")), true, "web/.env should have been created");
  assert.equal(
    readFileSync(join(dir, "web", ".env"), "utf8"),
    EXAMPLE,
    "the created file must be a verbatim copy of the example"
  );

  assert.match(result.stdout, /created\s+web\/\.env/);
  assert.match(result.stdout, /skipped\s+server\/\.env/);
  assert.match(result.stdout, /missing example\s+backoffice/);
  assert.match(result.stdout, /1 created, 1 skipped, 1 missing example/);
});
