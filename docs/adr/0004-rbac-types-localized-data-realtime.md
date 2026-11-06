# ADR 0004 — Custom roles, appointment types, localized data and realtime

Status: accepted (2026-11-07)

## 1. Custom roles and configurable RBAC

- Capabilities stay the closed list in `packages/shared/src/permissions.ts` (`manageRoles` added).
- `clinic_roles` rows hold a clinic's **customised system roles** (`key` = UserRole name,
  `isSystem = true`) and its **custom roles** (`key` = slug). `name`/`description` are
  `LocalizedText`; `baseRole` decides data scope (a DOCTOR-based role sees its own schedule) and
  is written to `user_memberships.role` so existing role checks keep working.
- `user_memberships.roleId` (and `invitations.roleId`) point at a clinic role; null = the system
  role named by `role`.
- Effective capabilities (`RbacService.capabilitiesFor`): SUPER_ADMIN → all; `roleId` → that row;
  else the clinic's customised system row; else `defaultCapabilities(role)`. Unknown strings are
  dropped. Cached 60 s in Redis per clinic version; any role or assignment change bumps
  `rbac:v:<clinicId>`.
- Routes declare `@RequireCapability('<capability>')` (RolesGuard). The UI reads
  `capabilities` from `/api/auth/me` and `/api/profile`; it never derives them from the role name.
- Guard rails (API-enforced, tested): only `manageRoles` holders edit roles; nobody can grant a
  capability they do not hold; SUPER_ADMIN is read-only; the CLINIC_ADMIN system role always keeps
  `LOCKED_ADMIN_CAPABILITIES`; a role with members cannot be deleted; a caller cannot change their
  own role; every change is audited (`clinic_role`, `user_membership`).

Routes: `GET /api/roles` (PermissionsMatrix), `POST /api/roles`, `PATCH /api/roles/:key`,
`DELETE /api/roles/:key`, `PATCH /api/memberships/:id/role` `{ roleKey }`.

## 2. Appointment types

- `appointment_types` per clinic: the three system types (CONSULTATION, FOLLOW_UP, EMERGENCY;
  backfilled by migration, re-ensured for new clinics) plus custom ones. `appointments.type` is
  now text holding the type `code`.
- `name` is `LocalizedText`; `durationMinutes` replaces `clinic_settings.durations` (kept in sync
  for older readers); `color` is a token key; `isEmergency` types are locked for the optimiser and
  enter the queue as EMERGENCY.
- A type in use can be deactivated, not deleted. Changing an appointment's type
  (`PATCH /api/appointments/:id/type`) re-applies the new duration through the booking
  transaction (exclusion constraint, working hours), audits, and emits `appointment.updated`.

Routes: `GET /api/appointment-types?includeInactive`, `POST`, `PATCH /:id`, `DELETE /:id`
(`manageSettings`).

## 3. Localized user data

- Entered data that people read in their own language carries `LocalizedText` next to its
  canonical column: patient first/last name, doctor first/last name, user first/last name,
  clinic name, room name, role name, appointment type name.
- Forms show one input per language (EN, FR, AR — Arabic `dir="rtl"`); at least one is required;
  the canonical column takes the clinic default language's value, else the first filled one.
- The API resolves names for the request language: `Accept-Language` (sent by the SPA from the
  active i18n language) → clinic default → any filled language → canonical. Mappers in
  `server/src/common/mappers.ts` do it through the request-scoped locale; DTOs that edit the
  value also return the full `LocalizedText`.
- Patient search matches every language through `patients.searchText` (lower-cased canonical +
  localized names, code, phone, email) with a trigram index.
- UI strings were already dynamic (i18next, switch without reload); notification texts are keys
  translated at read time. With this change the stored data follows the language too, and the SPA
  refetches on language change.

## 4. Realtime on the Python comms service

- `riaya-comms` (port 4200) is a long-running service: REST for the API, a **Socket.IO** server
  (`python-socketio`, path `/socket.io`) for browsers, and a Redis subscriber.
- Browsers never send their access token to the comms service. They call
  `POST /api/realtime/ticket` (authenticated, throttled) and connect with the returned one-time
  ticket: an HS256 JWT signed with `SERVICE_JWT_SECRET`, `aud: riaya-realtime`, 60 s, `jti`
  consumed once (Redis `SET NX`, in-memory without Redis).
- Rooms: `user:<id>`, `clinic:<id>`. Emitted events: `notification.created` (DTO +
  `unreadCount`), `notification.read`, `chat.message`, `chat.read` from the service's own writes;
  `queue.updated` and `appointment.*` relayed from the `riaya:events` Redis channel to the clinic
  room. With `REDIS_URL` the Socket.IO Redis manager fans out across instances.
- The SPA keeps polling as a fallback (slower while the socket is connected).
- Hosting: Socket.IO needs a long-running host (not Vercel functions); see the deployment notes.

## Consequences

- Roles and types are data, so every clinic can adapt them without a release; the closed
  capability list keeps the attack surface reviewable.
- Localized columns add storage and form fields, but no runtime translation service.
- The comms service becomes stateful (sockets): it needs a host that keeps processes alive.
