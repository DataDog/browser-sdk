# Code Review Guide (for agents)

What to look for when reviewing a PR. Linters, formatter and type-checker already run in CI — don't
repeat what they enforce. Focus on the project-specific concerns below.

## Principles

- **High signal only.** A wrong comment costs more than a missing one. If unsure, verify in the
  codebase or use `question:`, not `issue:`/`suggestion:`.
- **Check the existing pattern before flagging.** Code that looks wrong is often intentional and
  used elsewhere — grep first.
- **Don't restate code** or ask for comments that duplicate a clear name.
- **Few strong comments** beat many nitpicks.

## Comment style

Use [Conventional Comments](https://conventionalcomments.org/) labels:

- `praise:` — genuinely good (not filler).
- `issue:` — a concrete bug/regression to fix.
- `suggestion:` — a concrete improvement you're confident about.
- `nitpick:` — trivial, non-blocking.
- `thought:` / `question:` — when unsure; prefer over a wrong `issue:`/`suggestion:`.

## What to look for

### Bundle size

The minifier mangles local/top-level names but **not property names or object keys**.

- Long property/method/key names that ship to the bundle (e.g. `private veryLongDescriptiveProperty`)
  — suggest shorter names. Local vars get minified, so ignore those.
- Patterns that minify poorly: `class` where a closure works, `enum` vs `const enum` (see "Size
  control" in `docs/CONVENTIONS.md`).
- Dead abstractions: a one-call helper/wrapper/option adding bytes for no clear value.
- In general, any pattern that achieves the same result with less code is welcome.

### Backward compatibility

Backward compatibility is a requirement — watch for unintentional breaking changes: public API
changes, renamed/removed event fields, changed default values, or a different shape passed to
customer callbacks.

### Browser API availability

Browser APIs (e.g. `navigator.locks`, `navigator.sendBeacon`, `cookieStore`) may not exist in all
supported browsers or execution contexts (iframes, Web Workers). Any call to a browser API not
already established in the codebase must be guarded with an availability check.

See "Global object access" in `docs/CONVENTIONS.md` for the recommended pattern.

### Documentation

Public APIs require a TSDoc comment, including:

- a clear description,
- at least one example,
- the `@hidden` tag if experimental,
- the `@internal` tag if internal.

### Conventions (read the source doc, don't rely on memory)

- Naming, dependency-as-parameter, file org, utils/specHelper scoping — `docs/CONVENTIONS.md`.
- Public API rules (no `enum`, options object for customer callbacks) — `docs/CONVENTIONS.md`.
- Telemetry usage scope and repo-wide rules — `AGENTS.md`.
- Test patterns (`registerCleanupTask`, `collectAsyncCalls`, `mockable`) — `AGENTS.md` /
  `docs/TESTING.md`.

### Reuse over reinvention

Prefer existing utilities/types over new ones (e.g. `globalObject` over raw `window`/`globalThis`,
existing `Context` types, `*Utils` helpers).

## Do NOT comment on

- What Prettier/ESLint/`tsc` enforce (formatting, `prefer-template`, `prefer-optional-chain`, unused
  vars, imports).
- Auto-generated files: `CHANGELOG.md`, schema-generated `*.types.ts` (`DO NOT MODIFY`) — flag only
  if edited by hand.
- Comments/JSDoc that restate a clear name.
- Speculative `null`/`undefined` guards without a concrete failing case.
