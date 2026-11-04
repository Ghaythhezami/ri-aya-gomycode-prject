---
name: socket.io
description: Use when adding or changing the Socket.IO transport in realtime/ - handshake authentication, room membership, the Redis adapter, or the connect-attempt guard. Covers the project's pinned versions, Nest 11 pairing, and the tenancy rules a socket must obey.
package: socket.io
version-range: '^4.8.4'
source: custom (generated for this project, no upstream skill repo)
verified: false
---

# Socket.IO in Ri-aya

Custom skill generated for this repository. It is not an upstream community skill: do not
overwrite it from a remote source, and update it here when a convention changes.

> **Unverified.** No upstream skill repository was fetched when this file was written, and the
> official documentation could not be retrieved in that session. Everything below that is not
> visible in this repository is stated as a rule for our code, not as a claim about the library's
> behaviour. When a detail matters, check <https://socket.io/docs/v4/> before relying on it and
> correct this file in the same change. This is recorded as RISK-003 in the realtime-service spec.

## Versions and install

The workspace runs NestJS 11 (`server/package.json`). Socket.IO support must come from the
matching Nest major, not the latest:

| Package                      | Range     | Why                                                               |
| ---------------------------- | --------- | ----------------------------------------------------------------- |
| `@nestjs/websockets`         | `^11.2.8` | peers `@nestjs/core ^11`; 12.x requires Nest 12                   |
| `@nestjs/platform-socket.io` | `^11.2.8` | peers `@nestjs/websockets ^11`                                    |
| `socket.io`                  | `^4.8.4`  | server runtime                                                    |
| `@socket.io/redis-adapter`   | `^8.3.0`  | peers `socket.io-adapter ^2.5.4`                                  |
| `ioredis`                    | `^5.8.1`  | same range `server` already uses; do not introduce a second major |

Never install `@nestjs/websockets` or `@nestjs/platform-socket.io` at 12.x in this workspace: the
peer range fails, and pnpm will resolve a second `@nestjs/common` and break DI at runtime.

`socket.io-client` is a dev dependency used only by colocated specs. No production file may import
it.

## Handshake authentication

- Read the token from `socket.handshake.auth.token` first, then from an
  `Authorization: Bearer ...` header. Nothing else is a credential (FR-003).
- Verify with the same secret and claim semantics as `server`: `JWT_ACCESS_SECRET`, HS256, `exp`
  enforced, `sub` / `clinic_id` / `role` required. `server/src/auth/jwt.strategy.ts` defines
  those claim names - read it, do not guess.
- Reject in `allowRequest` or on `connection`, **before any `socket.join`**. A rejected connection
  must never be a member of a room.
- Emit one generic reason for every refusal (`UNAUTHORIZED`). Distinguishing "expired" from
  "bad signature" tells an attacker which half of the credential to fix (AC-002).
- Do not implement a second auth scheme, and do not accept a refresh token on the socket (NFR-010).

## Rooms and tenancy

- On a successful handshake, join `user:<sub>` and `clinic:<clinic_id>` server-side. The client
  never asks for these (FR-004, AC-003).
- Socket.IO lets a client reach any custom event handler we register, so a `room:join`-style
  handler is a scope-widening surface. Accept a room only if it equals one derived from the
  connection's own claims; refuse everything else with an error and add no membership
  (FR-005, NFR-011, AC-004). Re-joining an owned room is a no-op, not an error (EC-008).
- `socket.data` is the only place connection scope lives. Never read a clinic id from an inbound
  payload and trust it.
- Room names are built from token values only: `clinic:${clinicId}`. A forged name must be
  unrepresentable, not filtered.

## Expiry

A token that expires while the socket is connected must not keep listening. Schedule a disconnect
at `exp` when the connection is established, and clamp the delay: `setTimeout` overflows above
2^31-1 ms and fires immediately, so cap it and re-arm.
