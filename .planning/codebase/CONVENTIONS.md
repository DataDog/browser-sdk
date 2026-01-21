# Coding Conventions

**Analysis Date:** 2026-01-21

## Naming Patterns

**Files:**
- Source files: camelCase (e.g., `sessionStore.ts`, `errorCollection.ts`, `observable.ts`)
- Test files: `*.spec.ts` or `*.spec.tsx` for unit tests
- Scripts: kebab-case (e.g., files in `scripts/` directory)
- Event type files: `*Event.types.ts` with snake_case properties

**Functions:**
- camelCase for all functions (e.g., `startSessionManager`, `computeRawError`, `mockClock`)
- Factory functions prefixed with action verbs: `create*`, `start*`, `build*`, `mock*`
- Boolean predicates prefixed with `is*`, `has*`, `should*`

**Variables:**
- camelCase for local variables and parameters
- UPPER_SNAKE_CASE for constants (e.g., `SESSION_TIME_OUT_DELAY`, `STORAGE_POLL_DELAY`, `EXPIRED`)
- Prefix with underscore for unused parameters: `_message`, `_parameter`

**Types:**
- PascalCase for interfaces, types, and enums (e.g., `SessionStore`, `RawRumErrorEvent`, `Configuration`)
- Use `interface` over `type` for object shapes (enforced by `@typescript-eslint/consistent-type-definitions`)
- Prefer `type` for unions and complex type expressions
- Use `const enum` when possible for better transpilation output

## Code Style

**Formatting:**
- Tool: Prettier 3.7.4
- Config: `.prettierrc.yml`
- Key settings:
  - No semicolons (`semi: false`)
  - Single quotes (`singleQuote: true`)
  - Print width: 120 characters
  - 2-space indentation
  - Trailing commas: ES5 compatible
  - Arrow function parens: always

**Linting:**
- Tool: ESLint 9.39.2 with TypeScript ESLint 8.52.0
- Config: `eslint.config.mjs`
- Key rules enforced:
  - No `any` type restrictions in safety rules (but `@typescript-eslint/no-explicit-any: off`)
  - No default exports except for webpack configs (`import/no-default-export: error`)
  - Use `const enum` over regular `enum` when possible
  - No classes in production code (use functions instead) - `no-restricted-syntax` enforces this
  - No array spread (use `.concat` instead)
  - Use `dateNow()` instead of `Date.now()`
  - Single quotes with escape avoidance
  - Prefer template literals over concatenation
  - Object shorthand required
  - One variable declaration per line

## Import Organization

**Order:**
1. Built-in modules (Node.js)
2. External dependencies (npm packages)
3. Internal packages (`@datadog/browser-core`, etc.)
4. Parent directory imports (`../`)
5. Sibling imports (`./`)
6. Index imports

**Path Aliases:**
- Packages use monorepo references via `@datadog/*` scope
- Test utilities imported from `@datadog/browser-core/test`

**Type Imports:**
- Use `import type` for type-only imports (enforced by `@typescript-eslint/consistent-type-imports`)
- Prefer top-level type specifier style

**Examples:**
```typescript
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { clocksNow, dateNow } from '../../tools/utils/timeUtils'
import { Observable } from '../../tools/observable'
import type { Configuration } from '../configuration'
```

## Error Handling

**Patterns:**
- Use `try-catch` blocks sparingly; prefer validation and early returns
- Custom error types extend base `Error` with stack preservation
- Error monitoring via `monitor` utility and `monitorError` function
- User errors caught with `catchUserErrors` wrapper to prevent SDK crashes
- Display errors to console with `display.error()` from `packages/core/src/tools/display.ts`

**Error Display:**
```typescript
import { display } from '../../tools/display'

// Prefix all console messages with 'Datadog Browser SDK:'
display.error('Invalid session persistence', error)
display.warn('Configuration issue detected')
```

## Logging

**Framework:** Internal `display` utility (wrapper around console)

**Patterns:**
- Never use `console.*` directly in source code (enforced by `no-console: error`)
- Import `display` from `packages/core/src/tools/display.ts`
- Available methods: `debug`, `log`, `info`, `warn`, `error`
- All messages automatically prefixed with "Datadog Browser SDK:"

**Example:**
```typescript
import { display } from './tools/display'

display.warn('Session expired, creating new session')
display.error('Failed to initialize', error)
```

## Comments

**When to Comment:**
- Explain "why" not "what" - code should be self-documenting for "what"
- Document non-obvious business logic or workarounds
- Add context for browser compatibility workarounds
- Use `// eslint-disable-next-line` comments sparingly with justification
- Include ticket/issue references for temporary solutions
- Use `monitor-until` comments for temporary monitoring: `// monitor-until: YYYY-MM-DD, reason`

**JSDoc/TSDoc:**
- Required for public API methods (enforced by jsdoc rules)
- Include `@param` descriptions for all parameters
- Include `@returns` description
- Use `@category` to organize documentation
- Use `@internal` for private APIs
- Use `@deprecated` with migration guidance
- Use `@experimental` for unstable features

**Example:**
```typescript
/**
 * Starts the session manager for tracking user sessions.
 *
 * @param configuration - The RUM configuration object
 * @param lifeCycle - The event lifecycle manager
 * @returns Session manager instance with tracking methods
 */
export function startSessionManager<TrackingType extends string>(
  configuration: Configuration,
  lifeCycle: LifeCycle
): SessionManager<TrackingType>
```

## Function Design

**Size:**
- Keep functions focused on a single responsibility
- Extract complex logic into helper functions
- No strict line limit, but functions over 100 lines should be reviewed

**Parameters:**
- Use object parameters for more than 3 arguments
- Prefer explicit parameter objects over `options` bags
- Use destructuring in parameter lists

**Return Values:**
- Explicit return types for public APIs
- Prefer early returns over deep nesting
- Return meaningful objects, not just booleans when possible
- Use `undefined` (not `null`) for absent values

**Examples:**
```typescript
// Good: object parameter for multiple args
export function computeRawError({
  originalError,
  startClocks,
  nonErrorPrefix,
  source,
  handling,
}: {
  originalError: unknown
  startClocks: ClocksState
  nonErrorPrefix: NonErrorPrefix
  source: ErrorSource
  handling: ErrorHandling
}): RawError

// Good: early return
export function isSessionStarted(session: SessionState) {
  if (!session.id) {
    return false
  }
  return !isSessionInExpiredState(session)
}
```

## Module Design

**Exports:**
- Named exports only (no default exports except webpack configs)
- Export types and interfaces separately with `export type`
- Consistent type exports with `@typescript-eslint/consistent-type-exports`

**Barrel Files:**
- Used in `test/` directories to re-export test utilities
- Package entry points at `packages/*/src/index.ts`
- Keep barrel exports focused and purposeful

**Example:**
```typescript
// packages/core/test/index.ts
export * from './browserChecks'
export * from './cookie'
export type * from './typeUtils'
export * from './emulate/mockClock'
```

## TypeScript Specifics

**Type Safety:**
- Strict mode enabled
- No implicit any
- Strict null checks enabled
- Type assertions used sparingly with `as` keyword

**Const Enums:**
- Prefer `const enum` over regular enums (enforced for production code)
- Use object literals with `as const` for simple value sets

**Example:**
```typescript
export const DefaultPrivacyLevel = {
  ALLOW: 'allow',
  MASK: 'mask',
  MASK_USER_INPUT: 'mask-user-input',
} as const
export type DefaultPrivacyLevel = (typeof DefaultPrivacyLevel)[keyof typeof DefaultPrivacyLevel]
```

## Production Code Restrictions

**Classes:**
- Not allowed in `packages/*/src/**/*.ts` (except with eslint override)
- Use functions and closures instead
- Observable is an exception (class allowed)

**Date/Time:**
- Never use `Date.now()` - use `dateNow()` from timeUtils
- Use typed time values: `RelativeTime`, `TimeStamp`

**Syntax Restrictions:**
- No array spread - use `.concat()` instead
- No side effects in module scope (enforced by `local-rules/disallow-side-effects`)
- Guard against Zone.js patched values
- Avoid URL constructor in patched contexts

**Tools Directory:**
- `packages/core/src/tools/**` cannot import from `boot/`, `browser/`, `domain/`, or `transport/`
- Keeps utilities independent and reusable

---

*Convention analysis: 2026-01-21*
