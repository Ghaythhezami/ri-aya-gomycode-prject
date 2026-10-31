// AC-001 — a clone reaches a running stack: the three services come up healthy and
// the three documented ports serve the apps.
//
// The stack half is a real runtime assertion. Both tests skip when the prerequisite is
// absent (no Docker daemon / `pnpm dev` not running) rather than passing vacuously —
// the same convention as the Redis-gated AC-009 suite in server/.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORTS = [3000, 4000, 5173];

function dockerAvailable() {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function probe(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

// Vite binds to the IPv6 loopback (`[::1]:5173`) by default, while Next.js and Nest
// bind IPv4 as well. Probing only 127.0.0.1 reported the backoffice as down while it
// was serving, so both loopback families are checked.
async function portOpen(port) {
  const results = await Promise.all([probe("127.0.0.1", port), probe("::1", port)]);
  return results.some(Boolean);
}

test(
  "AC-001: postgres, redis and mongo all report healthy in the running stack",
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

test("AC-001: pnpm dev serves web, the API and the backoffice on 3000, 4000 and 5173", async (t) => {
  const open = [];

  for (const port of PORTS) {
    if (await portOpen(port)) open.push(port);
  }

  if (open.length === 0) {
    return t.skip("pnpm dev is not running on this host - start it to verify the three ports");
  }

  assert.deepEqual(
    open.sort((a, b) => a - b),
    PORTS,
    `expected all three ports open, got ${open.join(", ")}`
  );
});
