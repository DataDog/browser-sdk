# SvelteKit Design Decisions

## Architecture Overview

The SvelteKit integration follows the **Vue Router pattern**: wrap the framework's navigation system with an `afterNavigate`-style hook that calls `startView()` on each successful client-side navigation. SvelteKit's `afterNavigate` lifecycle hook from `$app/navigation` is the closest equivalent to Vue Router's `router.afterEach`, and the `page` state from `$app/state` provides a `route.id` property that directly exposes the parameterized route pattern (e.g. `/blog/[slug]`), making view name computation trivial compared to other frameworks.

Unlike Vue and React, SvelteKit does not expose a `createRouter()` function to wrap. Instead, the integration hooks into navigation via SvelteKit's built-in client-side lifecycle hooks, which must be called during component initialization (similar to Angular's `ENVIRONMENT_INITIALIZER` pattern).

## Public API

```typescript
// Plugin registration in datadogRum.init()
import { datadogRum } from '@datadog/browser-rum'
import { sveltekitPlugin } from '@datadog/browser-rum-sveltekit'

datadogRum.init({
  applicationId: '<DATADOG_APPLICATION_ID>',
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  plugins: [sveltekitPlugin({ router: true })],
})
```

```svelte
<!-- In root +layout.svelte to activate router tracking -->
<script>
  import { DatadogRouter } from '@datadog/browser-rum-sveltekit'
</script>

<DatadogRouter />
<slot />
```

The `DatadogRouter` component is a renderless Svelte component that calls `afterNavigate` during its initialization. This is required because SvelteKit's navigation hooks (`afterNavigate`, `beforeNavigate`, `onNavigate`) can only be called during component initialization — they cannot be called from a plain JS function at arbitrary times.

- Plugin: [packages/rum-vue/src/domain/vuePlugin.ts](packages/rum-vue/src/domain/vuePlugin.ts) (closest reference)
- Navigation hook pattern: [packages/rum-vue/src/domain/router/vueRouter.ts](packages/rum-vue/src/domain/router/vueRouter.ts)

## File Structure

```
packages/rum-sveltekit/
├── package.json                                    — package config, peer deps on @sveltejs/kit
├── tsconfig.json                                   — extends root tsconfig
├── README.md                                       — setup instructions
├── src/
│   ├── entries/
│   │   └── main.ts                                 — public exports (sveltekitPlugin, DatadogRouter)
│   ├── domain/
│   │   ├── sveltekitPlugin.ts                      — plugin + onRumInit/onRumStart subscriber pattern
│   │   ├── sveltekitPlugin.spec.ts                 — plugin structure tests
│   │   └── sveltekitRouter/
│   │       ├── DatadogRouter.svelte                — renderless component calling afterNavigate
│   │       ├── startSveltekitView.ts               — view name computation + startView call
│   │       ├── startSveltekitView.spec.ts          — computeViewName unit tests
│   │       ├── sveltekitRouter.spec.ts             — navigation integration tests
│   │       └── types.ts                            — minimal local type definitions
│   └── test/
│       └── initializeSveltekitPlugin.ts            — test helper for plugin setup
```

## Navigation Hook Decision

### Candidate hooks

| Hook | Timing | Route data available | Cancellable |
|------|--------|---------------------|-------------|
| [`beforeNavigate`](https://svelte.dev/docs/kit/$app-navigation#beforeNavigate) | Before navigation executes | `navigation.to.route.id`, `navigation.to.url` | Yes |
| [`onNavigate`](https://svelte.dev/docs/kit/$app-navigation#onNavigate) | Immediately before client-side navigation | `navigation.to.route.id`, `navigation.to.url` | No |
| [`afterNavigate`](https://svelte.dev/docs/kit/$app-navigation#afterNavigate) | After navigation + DOM render complete | `navigation.to.route.id`, `navigation.to.url` | No |

### Route data comparison

All three hooks provide the same `Navigation` object shape with `navigation.to` containing:
- `route.id` — the parameterized route pattern (e.g. `/blog/[slug]`)
- `url` — the full resolved URL
- `params` — the resolved parameter values

The route data quality is **identical** across all three hooks. The `route.id` is always the filesystem route pattern, regardless of when in the lifecycle the hook fires.

### Decision: `afterNavigate`

**Chosen:** `afterNavigate` from [`$app/navigation`](https://svelte.dev/docs/kit/$app-navigation#afterNavigate)

**Justification:**
1. **Post-redirect timing** — fires after all redirects (from `redirect()` in load functions, guards, `reroute` hook) have resolved. The view name reflects the final destination, not an intermediate redirect target.
2. **Post-failure timing** — only fires for successful navigations. Failed navigations (errors in load functions) don't trigger it, so no manual failure filtering needed.
3. **Initial navigation support** — fires on initial component mount (SSR hydration), so the first page view is automatically tracked without special-casing.
4. **Consistency with Vue** — mirrors the Vue Router `afterEach` approach used in [vueRouter.ts:15](packages/rum-vue/src/domain/router/vueRouter.ts#L15).

**Rejected:** `beforeNavigate` — fires before redirects resolve, would report incorrect view names for redirected navigations. Also cancellable navigations would need filtering.

**Rejected:** `onNavigate` — fires before load functions execute, which means data-dependent redirects haven't happened yet. Also doesn't fire for the initial SSR hydration or full-page navigations.

### Timing trade-off

`afterNavigate` fires after DOM rendering, slightly later than the ideal "right before data fetch" timing. However:
- SvelteKit load functions run concurrently with navigation, so there's no clear "before data fetch" hook on the client side
- The `startView()` call timestamps are close enough for RUM attribution
- This matches the Vue integration's approach

## View Name Algorithm

SvelteKit provides `page.route.id` (via the `navigation.to` object) which is the **filesystem route pattern** with parameter placeholders intact. This is the most direct route-to-view-name mapping of any framework integration.

### Algorithm

```
function computeViewName(routeId: string | null): string
  1. If routeId is null or empty, return '/'
  2. Strip route group segments: remove `(groupName)/` patterns
     - e.g. '/(auth)/login' → '/login'
     - e.g. '/(app)/dashboard/[id]' → '/dashboard/[id]'
  3. Normalize optional parameters: keep `[[param]]` as-is (they're part of the route pattern)
  4. Return the cleaned routeId
```

### Concept mapping

| SvelteKit route pattern | `route.id` value | Computed view name |
|------------------------|-------------------|-------------------|
| `src/routes/+page.svelte` | `/` | `/` |
| `src/routes/about/+page.svelte` | `/about` | `/about` |
| `src/routes/blog/[slug]/+page.svelte` | `/blog/[slug]` | `/blog/[slug]` |
| `src/routes/[...rest]/+page.svelte` | `/[...rest]` | `/[...rest]` |
| `src/routes/[[lang]]/home/+page.svelte` | `/[[lang]]/home` | `/[[lang]]/home` |
| `src/routes/(auth)/login/+page.svelte` | `/(auth)/login` | `/login` |
| `src/routes/(app)/dashboard/[id]/+page.svelte` | `/(app)/dashboard/[id]` | `/dashboard/[id]` |
| `src/routes/fruits/[page=fruit]/+page.svelte` | `/fruits/[page=fruit]` | `/fruits/[page=fruit]` |

- Reference: Vue's [`computeViewName`](packages/rum-vue/src/domain/router/startVueRouterView.ts#L15-L42) iterates over matched route records
- Reference: React's [`computeViewName`](packages/rum-react/src/domain/reactRouter/startReactRouterView.ts#L15-L43) concatenates route match paths

**Key difference from Vue/React:** No matched-route-record iteration needed. SvelteKit gives us the full route pattern directly via `route.id`. The only post-processing is stripping route group prefixes like `(auth)/`.

### Catch-all / rest parameter handling

Unlike Vue (`/:pathMatch(.*)*`) and React (`*`), SvelteKit's rest parameters (`[...rest]`) appear literally in `route.id`. Two options:

1. **Keep `[...rest]` as-is** — groups all catch-all hits under one view name (e.g. `/files/[...path]`)
2. **Substitute with actual path** — like Vue/React do, replace rest segment with the actual URL

**Decision:** Keep `[...rest]` as-is in the view name. Rationale:
- The parameterized pattern `/files/[...path]` is more useful for RUM aggregation than individual paths like `/files/a/b/c`
- This is consistent with how `[slug]` dynamic segments are kept as-is (we don't substitute them with `hello-world`)
- Vue and React substitute their catch-alls because their patterns (`/:pathMatch(.*)*`, `*`) are uninformative. SvelteKit's `[...path]` is already descriptive.
- If users want the actual path as the view name, they can use `setViewName()` in their load functions

## Wrapping Strategy

**Challenge:** SvelteKit doesn't expose a `createRouter()` function. The router is built into the framework and managed internally. Navigation hooks (`afterNavigate`, `beforeNavigate`, `onNavigate`) must be called during Svelte component initialization.

**Chosen approach: Renderless Svelte component**

```svelte
<!-- DatadogRouter.svelte -->
<script>
  import { afterNavigate } from '$app/navigation'
  import { startSveltekitView } from './startSveltekitView'

  afterNavigate((navigation) => {
    if (!navigation.to) return              // leaving the app
    startSveltekitView(navigation.to.route.id, navigation.to.url.pathname)
  })
</script>
```

Users place `<DatadogRouter />` in their root `+layout.svelte`. This ensures:
- The hook is registered once for the entire app lifecycle
- The root layout wraps all pages, so all navigations are captured
- The component persists across navigations (layouts don't remount on navigation)

**Reference patterns:**
- Angular uses [`ENVIRONMENT_INITIALIZER`](packages/rum-angular/src/domain/angularRouter/provideDatadogRouter.ts#L29-L63) — framework-specific initialization mechanism
- Vue wraps [`createRouter`](packages/rum-vue/src/domain/router/vueRouter.ts#L5-L26) — intercepts router creation
- React wraps [`createRouter`](packages/rum-react/src/domain/reactRouter/createRouter.ts#L4-L19) — intercepts router creation

The SvelteKit approach is closest to Angular's: use a framework-specific initialization mechanism rather than wrapping a router constructor.

**Rejected:** Exporting a plain function for users to call in `+layout.svelte`'s `<script>` — this would work but a component is more idiomatic in Svelte and harder to misuse (can't accidentally call it outside component init).

**Rejected:** Using SvelteKit hooks file (`hooks.client.js`) — these don't have access to `$app/navigation` lifecycle hooks and serve a different purpose (error handling, request interception).

## Type Strategy

**Approach: Minimal local types** (like Angular's [`RouteSnapshot`](packages/rum-angular/src/domain/angularRouter/types.ts))

```typescript
// types.ts
export interface NavigationTarget {
  route: {
    id: string | null
  }
  url: URL
}
```

We define a minimal interface matching the shape of SvelteKit's `Navigation.to` object. This avoids importing `@sveltejs/kit` types at runtime and keeps the package lightweight.

SvelteKit's `$app/navigation` and `$app/state` are virtual modules that only exist in a SvelteKit project context. The actual `afterNavigate` function and `page` state are provided by SvelteKit's runtime — our types just need to describe the callback parameter shape.

## Plugin Configuration

Follows the established pattern from all three reference implementations:

```typescript
export interface SveltekitPluginConfiguration {
  router?: boolean
}

export function sveltekitPlugin(configuration: SveltekitPluginConfiguration = {}): RumPlugin {
  return {
    name: 'sveltekit',
    onInit({ publicApi, initConfiguration }) {
      // Store publicApi and configuration for subscribers
      // Set trackViewsManually = true when router: true
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }
    },
    onRumStart({ addError }) {
      // Store addError for error reporting subscribers
    },
    getConfigurationTelemetry() {
      return { router: !!configuration.router }
    },
  }
}
```

- Reference: [vuePlugin.ts](packages/rum-vue/src/domain/vuePlugin.ts#L19-L44)
- Reference: [angularPlugin.ts](packages/rum-angular/src/domain/angularPlugin.ts#L44-L69)
- Reference: [reactPlugin.ts](packages/rum-react/src/domain/reactPlugin.ts#L55-L80)

## Peer Dependencies

```json
{
  "peerDependencies": {
    "@sveltejs/kit": "^2.0.0",
    "svelte": "^4.0.0 || ^5.0.0"
  },
  "peerDependenciesMeta": {
    "@sveltejs/kit": {
      "optional": true
    },
    "svelte": {
      "optional": true
    }
  }
}
```

- `@sveltejs/kit ^2.0.0` — SvelteKit 2.x is the current major (released 2023-12-14). Provides `$app/navigation`, `$app/state`, and the `Navigation` types.
- `svelte ^4.0.0 || ^5.0.0` — SvelteKit 2.x supports both Svelte 4 and Svelte 5. The component syntax used (`<script>` + `$props()`) can be adapted to work with both.

Reference: [Vue package.json peerDependencies](packages/rum-vue/package.json#L26-L28)

## Navigation Filtering

The `afterNavigate` hook in SvelteKit simplifies filtering compared to Vue/React:

| Scenario | How it's handled |
|----------|-----------------|
| **Failed navigations** | `afterNavigate` only fires on successful navigations. No filtering needed. |
| **Blocked by guards** | If `beforeNavigate` calls `cancel()`, `afterNavigate` never fires. No filtering needed. |
| **Redirects** | `afterNavigate` fires once with the final destination. Intermediate redirects don't trigger it. |
| **Duplicate navigations** | Must be filtered manually: compare `navigation.to.url.pathname` with previously tracked path. |
| **Query-only changes** | Must be filtered manually: compare pathname only, ignoring search params. |
| **Initial navigation** | `afterNavigate` fires on component mount. This is the initial view — always track it. `navigation.from` is `null` on initial mount, which can be used to distinguish it. |
| **Hash-only changes** | SvelteKit does not trigger `afterNavigate` for hash-only changes by default. No filtering needed. |
| **Shallow routing (`pushState`/`replaceState`)** | `afterNavigate` does NOT fire for shallow routing. These are state-only updates without actual navigation. No filtering needed. |

Filtering implementation:

```typescript
let currentPath: string | undefined

afterNavigate((navigation) => {
  if (!navigation.to) return  // leaving the app entirely

  const path = navigation.to.url.pathname

  if (path === currentPath) return  // duplicate or query-only change

  currentPath = path
  startSveltekitView(navigation.to.route.id, path)
})
```

- Reference: Vue filtering in [vueRouter.ts:15-22](packages/rum-vue/src/domain/router/vueRouter.ts#L15-L22)
- Reference: Angular filtering in [provideDatadogRouter.ts:43-54](packages/rum-angular/src/domain/angularRouter/provideDatadogRouter.ts#L43-L54)

## Test Strategy

### `sveltekitPlugin.spec.ts`
- Returns a plugin object with name "sveltekit"
- Calls callbacks registered with `onRumInit` during `onInit`
- Calls callbacks immediately if `onInit` was already invoked
- Sets `trackViewsManually` when `router: true`
- Does not set `trackViewsManually` when `router: false`
- Returns configuration telemetry (`{ router: true/false }`)
- Calls `onRumStart` subscribers during `onRumStart`
- Calls `onRumStart` subscribers immediately if already started

### `startSveltekitView.spec.ts`

**`startSveltekitView`:**
- Starts a new view with the computed view name
- Warns if `router: true` is missing from plugin config

**`computeViewName`:**
- Returns `/` when `routeId` is null
- Returns `/` when `routeId` is empty string
- Static routes: `/about` → `/about`
- Dynamic segments: `/blog/[slug]` → `/blog/[slug]`
- Nested dynamic segments: `/users/[id]/posts/[postId]` → `/users/[id]/posts/[postId]`
- Optional parameters: `/[[lang]]/home` → `/[[lang]]/home`
- Rest parameters: `/files/[...path]` → `/files/[...path]`
- Route groups stripped: `/(auth)/login` → `/login`
- Nested route groups stripped: `/(app)/dashboard/[id]` → `/dashboard/[id]`
- Multiple route groups stripped: `/(app)/(admin)/settings` → `/settings`
- Parameter matchers preserved: `/fruits/[page=fruit]` → `/fruits/[page=fruit]`
- Root route: `/` → `/`
- Deeply nested: `/a/[b]/c/[d]` → `/a/[b]/c/[d]`

### `sveltekitRouter.spec.ts` (integration tests)
- Calls `startView` on initial navigation (component mount)
- Calls `startView` on client-side navigation
- Does not call `startView` when navigating to the same path
- Does not call `startView` when only query params change
- Does not call `startView` when `navigation.to` is null (leaving app)
- Correctly computes view name with dynamic segments on navigation
- Correctly strips route groups from view name

Note: Integration tests for SvelteKit will require mocking `$app/navigation`'s `afterNavigate` since it's a virtual module. A mock helper similar to [initializeVuePlugin.ts](packages/rum-vue/src/test/) will be needed.

## Trade-offs and Alternatives

### View name: `route.id` vs matched-route-record iteration

- **Chosen:** Use `route.id` directly from SvelteKit's `navigation.to.route.id`
- **Rejected:** Iterating over matched route records (as Vue/React do)
- **Why:** SvelteKit provides `route.id` as a single string containing the full parameterized path. There are no matched route records to iterate — the filesystem-based router resolves to a single route. This is simpler and more reliable.

### Catch-all handling: keep pattern vs substitute

- **Chosen:** Keep `[...rest]` in view name
- **Rejected:** Substitute with actual URL path segments (as Vue/React do)
- **Why:** SvelteKit's `[...rest]` pattern is descriptive (includes the parameter name), unlike React's bare `*` or Vue's `/:pathMatch(.*)*`. Keeping it groups catch-all hits under one view name, which is better for RUM aggregation. Users can override with `setViewName()` if needed.

### Component vs function for hook registration

- **Chosen:** `<DatadogRouter />` renderless Svelte component
- **Rejected:** Exported function like `initDatadogRouter()` to call in `<script>` block
- **Why:** SvelteKit's `afterNavigate` must be called during component initialization. A component makes this constraint explicit and prevents misuse. It's also more idiomatic in Svelte — similar to how other Svelte libraries provide renderless components for side effects.

### Hook choice: `afterNavigate` vs `onNavigate`

- **Chosen:** `afterNavigate`
- **Rejected:** `onNavigate`
- **Why:** `afterNavigate` fires after redirects resolve and only for successful navigations, eliminating the need for failure/redirect filtering. It also fires on initial mount (SSR hydration), capturing the first page view automatically. `onNavigate` fires before load functions and doesn't fire on initial mount or full-page navigations.

### Route groups: strip vs keep

- **Chosen:** Strip route group segments like `(auth)` from view names
- **Rejected:** Keep them as-is
- **Why:** Route groups are an organizational tool that doesn't affect URLs. Users don't see `(auth)` in their browser URL bar, and it shouldn't appear in RUM view names. Keeping them would fragment views across group names for the same URL.

## Unmapped Concepts

### Unmapped: Server hooks (`handle`, `handleFetch`, `handleError`)

**Severity:** minor
**Reason:** Server hooks run on the server side before SSR. The Browser SDK operates client-side only. Server-side request handling is out of scope.
**Impact:** No impact on client-side RUM view tracking. Server-side observability would require a separate server-side integration (not part of this package).

### Unmapped: `reroute` hook

**Severity:** minor
**Reason:** The `reroute` hook remaps URLs internally before routing. By the time `afterNavigate` fires on the client, the final route has been resolved. The view name from `route.id` reflects the actual matched route, regardless of any rerouting that occurred.
**Impact:** None — rerouting is transparent to the integration.

### Unmapped: Shallow routing (`pushState`/`replaceState`)

**Severity:** minor
**Reason:** SvelteKit's shallow routing creates history entries without triggering actual navigation. `afterNavigate` does not fire for these. They are typically used for modals or state-driven UI, not page transitions.
**Impact:** Shallow routing state changes won't create new RUM views. This is correct behavior — they don't represent page navigations.

### Unmapped: `+page@` layout breakout syntax

**Severity:** minor
**Reason:** Layout breakout (`+page@.svelte`) changes which layout wraps a page but doesn't affect the route's `id` or URL. The view name is derived from `route.id`, which is unaffected by layout breakout.
**Impact:** None.

### Unmapped: Content negotiation (`+server.js` routes)

**Severity:** minor
**Reason:** API routes (`+server.js`) handle non-page requests (fetch calls, form submissions). They don't trigger client-side navigation and thus don't produce RUM views.
**Impact:** None — API route performance should be monitored server-side, not via client-side RUM.
