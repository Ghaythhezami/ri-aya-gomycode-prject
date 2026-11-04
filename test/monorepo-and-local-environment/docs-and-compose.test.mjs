// AC-002 and AC-006 — every service is declared and health-checked, and the
// documented quick start matches what actually exists.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const compose = readFileSync(join(REPO_ROOT, "docker-compose.yml"), "utf8");
const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");

// Split the compose file into `serviceName -> [lines]` using two-space indentation,
// which is how the services are declared here. Avoids needing a YAML dependency.
function serviceBlocks(text) {
  const blocks = new Map();
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const start = line.match(/^ {2}([a-z][a-z0-9-]*):\s*$/);

    if (start) {
      current = start[1];
      blocks.set(current, []);
      continue;
    }

    if (/^\S/.test(line)) current = null; // back to column 0: end of `services:`
    if (current) blocks.get(current).push(line);
  }

  return blocks;
}

test("TEST-001 AC-002: postgres, redis and mongo each declare a healthcheck and a named volume", () => {
  const blocks = serviceBlocks(compose);
  const volumesSection = compose.slice(compose.lastIndexOf("\nvolumes:"));

  for (const [service, volume] of [
    ["postgres", "riaya_pgdata"],
    ["redis", "riaya_redisdata"],
    ["mongo", "riaya_mongodata"]
  ]) {
    const block = blocks.get(service);
    assert.ok(block, `docker-compose.yml must declare the ${service} service`);

    const text = block.join("\n");
    assert.match(text, /^\s+healthcheck:/m, `${service} must declare a healthcheck`);
    assert.match(text, /^\s+volumes:/m, `${service} must persist to a volume`);
    assert.ok(text.includes(`${volume}:/`), `${service} must mount the named volume ${volume}`);
    assert.ok(volumesSection.includes(`${volume}:`), `${volume} must be declared in the volumes section`);
  }
});

test("TEST-005 AC-006: the README quick start names the three services, the bootstrap command and the three ports", () => {
  for (const required of [
    "pnpm install",
    "pnpm setup",
    "docker compose up -d",
    "pnpm dev",
    "PostgreSQL",
    "Redis",
    "MongoDB",
    ":3000",
    ":4000",
    ":5174"
  ]) {
    assert.ok(readme.includes(required), `README quick start must mention ${required}`);
  }

  // The retired manual copy-paste setup must not be presented as the path any more.
  assert.equal(
    /cp server\/\.env\.example server\/\.env/.test(readme),
    false,
    "the README must not tell developers to copy env files by hand"
  );
});
