# Design: `@datadog/browser-native` package

**Date:** 2026-02-25

## Goal

Create a new package that exposes all native browser API callsites used across the repository as a clean isolation layer between SDK code and the browser. The long-term goal is to reduce BrowserStack unit test scope to just this package — everything else can run in jsdom or headless Chrome.

## Context

The codebase already has `packages/core/src/browser/` with wrappers for fetch, XHR, cookies, event listeners, and observables. However, native browser API calls are scattered directly within that code with no formal seam for testing or isolation. This package establishes that seam.

## Decisions

| Question | Decision |
|---|---|
| Relationship to existing `core/src/browser/` | New layer — keep existing code, update callsites to import from the new package |
| API style | Standalone function exports |
| Function naming | Match browser API names where functions exist; getter/setter convention for properties |
| Injection mechanism | Module-level (no mockable in v1 — added later) |
| Initial scope | `packages/core/src/browser/` callsites only |
| Mockability | Not in v1; the isolation boundary is established first |

## Architecture

New package at the base of the dependency graph — zero SDK dependencies.

```
@datadog/browser-native   ← new, zero SDK deps
         ↓
@datadog/browser-core
         ↓
@datadog/browser-rum-core, @datadog/browser-logs, ...
```

`@datadog/browser-core` adds `@datadog/browser-native` as a dependency.

## Package location

`packages/browser-native/` → published as `@datadog/browser-native`

Follows the existing monorepo package structure:

```
packages/browser-native/
├── src/
│   ├── index.ts          # Re-exports everything
│   ├── network.ts        # fetch, sendBeacon
│   ├── events.ts         # addEventListener, removeEventListener
│   ├── document.ts       # getCookie, setCookie, getReadyState, getVisibilityState
│   └── performance.ts    # now
├── package.json
└── tsconfig.json
```

## Exports

Standalone functions. Browser function names used directly; getter/setter convention for property accesses.

```ts
// Network
export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
export function sendBeacon(url: string, data?: BodyInit | null): boolean

// Events
export function addEventListener(
  target: EventTarget,
  type: string,
  listener: EventListener,
  options?: AddEventListenerOptions
): void
export function removeEventListener(
  target: EventTarget,
  type: string,
  listener: EventListener,
  options?: EventListenerOptions
): void

// Document properties
export function getCookie(): string                     // wraps document.cookie getter
export function setCookie(value: string): void          // wraps document.cookie setter
export function getReadyState(): DocumentReadyState     // wraps document.readyState
export function getVisibilityState(): VisibilityState   // wraps document.visibilityState

// Performance
export function now(): number                           // wraps performance.now()
```

### ZoneJS bypass

`getZoneJsOriginalValue` moves from `packages/core/src/tools/` to `packages/browser-native/src/`. It has no SDK dependencies and is fundamentally about obtaining unpatched native values — it belongs in this layer. `fetch` and `addEventListener` use it internally.

## Migration

`packages/core/src/browser/` files are not restructured. Only their direct native callsites are updated to import from `@datadog/browser-native`:

```ts
// Before
document.cookie = `${name}=${value};...`
const value = document.cookie

// After
import { setCookie, getCookie } from '@datadog/browser-native'
setCookie(`${name}=${value};...`)
const value = getCookie()
```

All SDK logic — observables, monitoring, event trust filtering, the `addEventListener` wrapper — stays in `core/src/browser/` unchanged.

## Testing

`packages/browser-native` ships with its own unit tests co-located with source (`*.spec.ts`). These are the tests that require real browser APIs and are candidates for BrowserStack.

Rerouting the BrowserStack scope (marking non-native tests as jsdom-only) is a **follow-up** outside v1 scope.

## Out of scope for v1

- `mockable()` wrapping on exported functions (added in a later phase once the boundary is proven)
- Expanding scope beyond `packages/core/src/browser/` callsites
- Rerouting BrowserStack test scope
- Covering `packages/rum-core/src/browser/` callsites
