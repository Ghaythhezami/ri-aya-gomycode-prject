---
name: zod
description: Use when declaring or consuming a zod schema in @riaya/shared or a front-end page. Covers the project's zod 4 conventions, derived types, message handling, and server-parity rules.
package: zod
version-range: '^4.6.7'
source: custom (generated for this project, no upstream skill repo)
---

# zod in Ri-aya

Custom skill generated for this repository. It is not an upstream community skill: do not
overwrite it from a remote source, and update it here when a convention changes.

## Version and install

- Range: `^4.6.7`. The workspace pins it once in `pnpm-workspace.yaml`:

  ```yaml
  overrides:
    zod: ^4.6.7
  ```

- Never introduce a second major. `zod` 4 lives at the package root (no `/v4` subpath) and exports
  from `zod` directly.
- `backoffice` (and from BP-045, `packages/shared`) depend on it. `web` and `server` do not, and
  `server` must **not** get it: the API validates through `class-validator` and the `ValidationPipe`
  (CON-515).
- Compatible helper: `@hookform/resolvers/zod` `zodResolver` in `backoffice` forms.

## Canonical usage

```ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(), // zod 4 top-level format, NOT z.string().email()
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

Rules:

1. **Infer, never re-declare.** A type that mirrors a schema must come from `z.infer<typeof …`.
   Writing the interface by hand next to the schema is the duplication BP-045 exists to delete.
2. **One schema per shared contract**, in `packages/shared/src/schemas/`, re-exported from
   `packages/shared/src/index.ts`. Consumers import from `@riaya/shared`, never from a deep path.
3. **Engine rules only, messages at the edge.** In `@riaya/shared` write rules with no message
   argument. A page that needs a translated message passes it at the call site:
   `loginSchema.extend({ email: z.email(t('auth.emailRequired')) })` — extend at the edge rather than
   move i18n into the package.
4. **Password rules describe, never store.** `z.string().min(8)` etc. mirror the DTO; never put a
   password literal, token, or connection string in a schema, default, or `.default()`.
5. **No side effects.** A schema module may import only `zod` and other schema modules. No `fetch`,
   no `process.env`, no React, no `localStorage`.
6. **Server parity is the API's job to keep.** The shared schema mirrors `server/src/**/dto/*.ts`;
   the DTO stays authoritative. When the API changes, the schema changes with it in the same change.

## zod 4 vs 3 — pitfalls already seen in this repo

| zod 3                            | zod 4 (use this)                  |
| -------------------------------- | --------------------------------- |
| `z.string().email(msg)`          | `z.email(msg)`                    |
| `z.string().uuid()`              | `z.uuid()`                        |
| `z.string().url()`               | `z.url()`                         |
| `z.string().ip()`                | `z.ipv4()` / `z.ipv6()`           |
| `schema.parse` error `.format()` | `.tree()` / `z.treeifyError(err)` |
| `z.nativeEnum(E)` (deprecated)   | `z.enum(E)` with a native TS enum |
| `z.record(value)`                | `z.record(z.string(), value)`     |

- `z.infer` still works; `z.input` vs `z.output` matters as soon as `.default()`/`.transform()` is used.
- Prefer exhaustive object schemas over `passthrough()`; strict shapes catch drift from the API.
- Enums: mirror the server's enum values exactly — a missing member is a runtime 400 from the API.

## Project conventions

- `packages/shared` is the single source of shared contracts; it is consumed as TypeScript source
  (`main`/`types` → `src/index.ts`), so there is no build step and no `dist` to keep in sync.
- `backoffice/src/pages/*.tsx` keep their own `react-i18next` messages; only the shape moves.
- Lint runs per app (`eslint`) and formatting is enforced by the root husky + lint-staged prettier
  hook; run `prettier --write` before committing.

## Security checklist before committing a schema

- [ ] No secret, token, password value, or URL with credentials.
- [ ] No `process.env` read.
- [ ] No import outside `zod` and sibling schema modules.
- [ ] Length/format limits present on every free-text field (avoid unbounded strings on input).
- [ ] Validation on the API is still `class-validator` — the schema is not wired into a pipe.
