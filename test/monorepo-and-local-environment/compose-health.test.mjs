// AC-001 — a clone reaches a running stack.
//
// This asserts the half that is regression-sensitive and reproducible: the three services
// come up and report healthy. It skips when no Docker daemon is available rather than
// passing vacuously - the same convention as the Redis-gated AC-009 suite.
//
// The "pnpm dev serves 3000/4000/5173" half of AC-001 is NOT asserted here. That would make
// the suite depend on a human leaving three long-running servers up, and a partially-running
// stack (a stale Nest on :4000, Vite on :5174) makes it fail for reasons that have nothing to
// do with this feature. It was verified manually and is recorded in the test report:
// web 3000, API 4000 and backoffice [::1]:5173 all answering. Automating it properly means
// spawning and tearing down the dev stack inside the test - tracked as a follow-up, not
// faked here.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function dockerAvailable() {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test(
  "TEST-007 AC-001: postgres, redis and mongo all report healthy in the running stack",
  { skip: dockerAvailable() ? false : "no Docker daemon available on this host" },
  () => {
    const out = execFileSync("docker", ["ps", "--filter", "name=riaya", "--format", "{{.Names}}|{{.Status}}"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });
    const lines = out.split(/\r?\n/).filter(Boolean);

    for (const service of ["postgres", "redis", "mongo"]) {
      const line = lines.find((entry) => entry.includes(`riaya-${service}`));
      assert.ok(line, `no running container found for ${service} - run: docker compose up -d`);
      assert.match(line, /\(healthy\)/i, `${service} must be healthy, got: ${line}`);
    }
  }
);
