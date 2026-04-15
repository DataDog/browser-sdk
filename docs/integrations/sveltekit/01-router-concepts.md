# SvelteKit Router Concepts

## Route Definition Format

SvelteKit uses a [filesystem-based router](https://svelte.dev/docs/kit/routing) where URL paths map directly to directories under `src/routes/`. Route files are identified by a `+` prefix — any other files in route directories are ignored by the router.

### Route File Types

| File | Purpose |
|------|---------|
| [`+page.svelte`](https://svelte.dev/docs/kit/routing#page-page.svelte) | Page component rendered for the route |
| [`+page.js`](https://svelte.dev/docs/kit/routing#page-page.js) | Universal load function (runs server + client) |
| [`+page.server.js`](https://svelte.dev/docs/kit/routing#page-page.server.js) | Server-only load function and form actions |
| [`+layout.svelte`](https://svelte.dev/docs/kit/routing#layout-layout.svelte) | Layout component wrapping child routes |
| [`+layout.js`](https://svelte.dev/docs/kit/routing#layout-layout.js) | Universal layout load function |
| [`+layout.server.js`](https://svelte.dev/docs/kit/routing#layout-layout.server.js) | Server-only layout load function |
| [`+server.js`](https://svelte.dev/docs/kit/routing#server-server.js) | API route handler (GET, POST, PUT, DELETE, etc.) |
| [`+error.svelte`](https://svelte.dev/docs/kit/routing#error-error.svelte) | Error boundary component |

### Example

```
src/routes/
├── +page.svelte              → /
├── +layout.svelte            → wraps all pages
├── about/
│   └── +page.svelte          → /about
├── blog/
│   ├── +page.svelte          → /blog
│   ├── +layout.svelte        → wraps /blog and children
│   └── [slug]/
│       ├── +page.svelte      → /blog/:slug
│       └── +page.server.js   → server load for /blog/:slug
└── api/
    └── random/
        └── +server.js        → /api/random (API endpoint)
```

Page components receive data from load functions via the `data` prop:

```svelte
<!--- file: src/routes/blog/[slug]/+page.svelte --->
<script>
  /** @type {import('./$types').PageProps} */
  let { data } = $props();
</script>

<h1>{data.title}</h1>
<div>{@html data.content}</div>
```

Load functions receive route params, URL, and other context:

```js
/// file: src/routes/blog/[slug]/+page.js
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export function load({ params }) {
  if (params.slug === 'hello-world') {
    return {
      title: 'Hello world!',
      content: 'Welcome to our blog.'
    };
  }
  error(404, 'Not found');
}
```

## Dynamic Segment Syntax

SvelteKit uses [bracket notation](https://svelte.dev/docs/kit/routing#layout-page.js) for dynamic route segments:

| Syntax | Meaning | Example Directory | Matches |
|--------|---------|-------------------|---------|
| `[param]` | Required parameter | `src/routes/blog/[slug]/` | `/blog/hello-world` |
| `[[param]]` | [Optional parameter](https://svelte.dev/docs/kit/advanced-routing#Optional-parameters) | `src/routes/[[lang]]/home/` | `/home` or `/en/home` |
| `[...rest]` | [Rest parameter](https://svelte.dev/docs/kit/advanced-routing#Rest-parameters) (catch-all) | `src/routes/files/[...path]/` | `/files/a/b/c` |

Parameters are available in load functions via `params`:

```js
/// file: src/routes/blog/[slug]/+page.js
/** @type {import('./$types').PageLoad} */
export function load({ params }) {
  console.log(params.slug); // 'hello-world'
}
```

### Parameter Matchers

Route parameters can be validated with [matchers](https://svelte.dev/docs/kit/advanced-routing#Matching) defined in `src/params/`:

```js
/// file: src/params/fruit.js
export const match = (param) => {
  return param === 'apple' || param === 'orange';
};
```

Used in route directories as `[page=fruit]`:

```
src/routes/fruits/[page=fruit]/+page.svelte
```

Matchers run both server-side and in the browser. Invalid parameters cause SvelteKit to try other routes.

## Catch-All / Wildcard Syntax

SvelteKit uses [rest parameters](https://svelte.dev/docs/kit/advanced-routing#Rest-parameters) (`[...rest]`) for catch-all routes. The parameter captures all remaining path segments as a single slash-separated string.

```
src/routes/files/[...path]/+page.svelte
```

A request to `/files/a/b/c/d` produces `params.path === 'a/b/c/d'`.

Rest parameters also match zero segments: `src/routes/a/[...rest]/z/+page.svelte` matches `/a/z`, `/a/b/z`, and `/a/b/c/z`.

### 404 Pages via Rest Parameters

Custom 404 handling uses a catch-all route that throws a 404 error:

```js
/// file: src/routes/[...catchall]/+page.js
import { error } from '@sveltejs/kit';

export const load = () => {
  error(404, 'Not Found');
};
```

### Constraint

An optional parameter cannot follow a rest parameter (`[...rest]/[[optional]]`) because rest parameters match greedily.

## Navigation Lifecycle Hooks

SvelteKit exposes navigation lifecycle hooks via two channels: **client-side hooks** in [`$app/navigation`](https://svelte.dev/docs/kit/$app-navigation) (component-scoped) and **server/universal hooks** in hook files.

### Client-Side Navigation Hooks

These fire during client-side navigations (SPA-style). They are component lifecycle hooks — active for the component's lifetime.

#### 1. [`beforeNavigate`](https://svelte.dev/docs/kit/$app-navigation#beforeNavigate)

```typescript
function beforeNavigate(
  callback: (navigation: BeforeNavigate) => void
): void;
```

- **When:** Fires before any navigation (link clicks, `goto()`, browser back/forward)
- **Data available:** `navigation` object with `from`, `to`, `type`, `willUnload`, `delta` (for popstate)
- **Can cancel/redirect:** Yes — call `navigation.cancel()` to prevent navigation. For `'leave'` type navigation (leaving the page entirely), triggers the browser's native unload confirmation dialog.

#### 2. [`onNavigate`](https://svelte.dev/docs/kit/$app-navigation#onNavigate)

```typescript
function onNavigate(
  callback: (navigation: OnNavigate) => MaybePromise<(() => void) | void>
): void;
```

- **When:** Fires immediately before client-side navigation executes (excludes full-page/external navigations)
- **Data available:** `navigation` object with `from`, `to`, `type`, `delta`, `willUnload`
- **Can cancel/redirect:** No direct cancellation. Supports returning a Promise (for `document.startViewTransition`). If a function is returned, it executes after the DOM updates.

#### 3. [`afterNavigate`](https://svelte.dev/docs/kit/$app-navigation#afterNavigate)

```typescript
function afterNavigate(
  callback: (navigation: AfterNavigate) => void
): void;
```

- **When:** Fires after navigation completes and the new page is rendered. Also fires on initial component mount.
- **Data available:** `navigation` object with `from`, `to`, `type`, `willUnload`, `delta`
- **Can cancel/redirect:** No — navigation is already complete.

### Server Hooks (`src/hooks.server.js`)

#### [`handle`](https://svelte.dev/docs/kit/hooks#Server-hooks-handle)

```typescript
type Handle = (input: {
  event: RequestEvent;
  resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>;
```

- **When:** Runs for every server request (including prerendering), before route resolution
- **Data available:** Full `RequestEvent` (url, params, cookies, locals, request, platform)
- **Can cancel/redirect:** Yes — can return a custom Response, redirect, or modify the event before calling `resolve()`

Multiple `handle` functions can be composed using the [`sequence`](https://svelte.dev/docs/kit/hooks#Server-hooks-handle) helper from `@sveltejs/kit/hooks`.

#### [`handleFetch`](https://svelte.dev/docs/kit/hooks#Server-hooks-handleFetch)

```typescript
type HandleFetch = (input: {
  event: RequestEvent;
  request: Request;
  fetch: typeof fetch;
}) => MaybePromise<Response>;
```

- **When:** Runs when a `fetch` is made inside a load function during SSR
- **Data available:** The original `request`, `event`, and `fetch` function
- **Can cancel/redirect:** Can modify the request or return a different response

#### [`handleError`](https://svelte.dev/docs/kit/hooks#Shared-hooks-handleError)

```typescript
// Server version
type HandleServerError = (input: {
  error: unknown;
  event: RequestEvent;
  status: number;
  message: string;
}) => MaybePromise<void | App.Error>;

// Client version (in hooks.client.js)
type HandleClientError = (input: {
  error: unknown;
  event: NavigationEvent;
  status: number;
  message: string;
}) => MaybePromise<void | App.Error>;
```

- **When:** Runs on unexpected errors during loading or rendering (both server and client)
- **Data available:** The error, event, status code, and default message
- **Can cancel/redirect:** No — handles error reporting/logging only

### Universal Hooks (`src/hooks.js`)

#### [`reroute`](https://svelte.dev/docs/kit/hooks#Universal-hooks-reroute)

```typescript
type Reroute = (event: {
  url: URL;
  fetch: typeof fetch;
}) => MaybePromise<string | void>;
```

- **When:** Before `handle`, translates a URL into a different route pathname
- **Data available:** The URL being requested
- **Can cancel/redirect:** Can remap to a different route (does not change browser URL or `event.url`)

#### [`init`](https://svelte.dev/docs/kit/hooks#Shared-hooks-init)

```typescript
type ServerInit = () => MaybePromise<void>;
```

- **When:** Once, when the server starts or app initializes
- **Data available:** None
- **Can cancel/redirect:** No — one-time initialization only

#### [`transport`](https://svelte.dev/docs/kit/hooks#Universal-hooks-transport)

```typescript
type Transport = {
  [x: string]: Transporter<any, any>;
};
type Transporter = {
  encode: (value: any) => any;
  decode: (data: any) => any;
};
```

- **When:** During server→client data serialization
- **Purpose:** Custom type serialization across the server/client boundary

## Navigation Lifecycle Timing

### Client-Side Navigation (SPA-style)

When a user clicks a link or `goto()` is called:

1. **`beforeNavigate`** fires — can cancel navigation via `cancel()`
2. **`reroute`** (universal hook) — may remap the URL to a different route
3. **`onNavigate`** fires — last chance before navigation executes; supports view transitions via promises
4. **Load functions execute** — all matching `+page.js`, `+page.server.js`, `+layout.js`, `+layout.server.js` run concurrently (parallel loading, no waterfall)
   - Redirects via `redirect()` inside load functions abort the current navigation and restart from step 1 with the redirect target
   - `handleFetch` intercepts any `fetch()` calls within load functions during SSR
5. **Component rendering** — new page/layout components mount with loaded data
6. **`afterNavigate`** fires — navigation complete, DOM updated

### Server-Side Request (Initial Page Load / SSR)

1. **`init`** — runs once on server startup (not per-request)
2. **`reroute`** — may remap URL before routing
3. **`handle`** — runs for every request; can modify event, add to `locals`, or short-circuit with a custom response
4. **Route matching** — filesystem-based, using [priority rules](https://svelte.dev/docs/kit/advanced-routing#Sorting)
5. **Load functions execute** — server load functions run; `handleFetch` intercepts fetch calls
   - Redirects via `redirect()` send an HTTP redirect response
6. **HTML rendering** — SSR produces HTML; `handle`'s `resolve()` options can transform the output
7. **Client hydration** — client-side JavaScript takes over; `afterNavigate` fires

### Redirect Resolution

- In load functions: calling [`redirect()`](https://svelte.dev/docs/kit/load#Redirects) throws an exception that aborts the current load and triggers a new navigation to the target URL
- In `handle` hook: can return a `redirect()` response before load functions execute
- In `reroute` hook: remaps the route internally (no HTTP redirect, URL stays the same)

### Data Fetch Execution

- All load functions for a page and its parent layouts run [concurrently](https://svelte.dev/docs/kit/load#Parallel-loading) (parallel, not waterfall)
- Child load functions can `await parent()` to access parent load data (creates sequential dependency)
- Load functions [rerun automatically](https://svelte.dev/docs/kit/load#Rerunning-load-functions) when their dependencies change (params, url, or custom dependencies via `depends()`)
- Manual revalidation via [`invalidate()`](https://svelte.dev/docs/kit/$app-navigation#invalidate) or [`invalidateAll()`](https://svelte.dev/docs/kit/$app-navigation#invalidateAll)

## Route Matching Model

SvelteKit uses a **nested, file-based** route matching model.

### Nesting and Layouts

Routes nest naturally via the filesystem. Each directory level can have its own `+layout.svelte` that wraps all child routes:

```
src/routes/
├── +layout.svelte         → root layout (wraps everything)
├── settings/
│   ├── +layout.svelte     → settings layout (wraps /settings/*)
│   ├── +page.svelte       → /settings
│   ├── profile/
│   │   └── +page.svelte   → /settings/profile
│   └── notifications/
│       └── +page.svelte   → /settings/notifications
```

Data from parent layout load functions is available to all child pages.

### Route Groups

[Route groups](https://svelte.dev/docs/kit/advanced-routing#Advanced-layouts) use parenthesized directories to share layouts without affecting URLs:

```
src/routes/
├── (auth)/
│   ├── +layout.svelte     → shared auth layout
│   ├── login/+page.svelte  → /login
│   └── register/+page.svelte → /register
├── (app)/
│   ├── +layout.svelte     → shared app layout
│   ├── dashboard/+page.svelte → /dashboard
│   └── settings/+page.svelte  → /settings
```

### Breaking Out of Layouts

The [`+page@` syntax](https://svelte.dev/docs/kit/advanced-routing#Advanced-layouts) allows pages to reset their layout hierarchy:

| File | Inherits Layout From |
|------|---------------------|
| `+page@[id].svelte` | The `[id]` segment's layout |
| `+page@item.svelte` | The `item` segment's layout |
| `+page@(app).svelte` | The `(app)` group's layout |
| `+page@.svelte` | The root layout |

Layouts can also break out using the same `@` syntax on `+layout@.svelte`.

### Route Priority

When multiple routes match a URL, SvelteKit applies [priority rules](https://svelte.dev/docs/kit/advanced-routing#Sorting):

1. More specific routes (fewer parameters) rank higher
2. Routes with matchers (`[name=type]`) rank higher than untyped parameters
3. Optional and rest parameters have lowest priority
4. Alphabetical tie-breaking

### Content Negotiation

For routes with both `+page` and `+server.js`, SvelteKit uses [content negotiation](https://svelte.dev/docs/kit/routing#server-server.js):
- `PUT`/`PATCH`/`DELETE`/`OPTIONS` → always `+server.js`
- `GET`/`POST`/`HEAD` → page request if `Accept: text/html` is prioritized, otherwise `+server.js`

## Programmatic Navigation API

### Navigation Functions ([`$app/navigation`](https://svelte.dev/docs/kit/$app-navigation))

#### [`goto`](https://svelte.dev/docs/kit/$app-navigation#goto)

```typescript
function goto(
  url: string | URL,
  opts?: {
    replaceState?: boolean;
    noScroll?: boolean;
    keepFocus?: boolean;
    invalidateAll?: boolean;
    invalidate?: (string | URL | ((url: URL) => boolean))[];
    state?: App.PageState;
  }
): Promise<void>;
```

Programmatic navigation to a route. For external URLs, use `window.location`.

#### [`pushState`](https://svelte.dev/docs/kit/$app-navigation#pushState) / [`replaceState`](https://svelte.dev/docs/kit/$app-navigation#replaceState)

```typescript
function pushState(url: string | URL, state: App.PageState): void;
function replaceState(url: string | URL, state: App.PageState): void;
```

[Shallow routing](https://svelte.dev/docs/kit/shallow-routing) — create or replace history entries without full navigation. Used for history-driven modals and other state-driven UI.

#### [`invalidate`](https://svelte.dev/docs/kit/$app-navigation#invalidate) / [`invalidateAll`](https://svelte.dev/docs/kit/$app-navigation#invalidateAll)

```typescript
function invalidate(resource: string | URL | ((url: URL) => boolean)): Promise<void>;
function invalidateAll(): Promise<void>;
```

Force load functions to rerun. `invalidate` targets specific dependencies; `invalidateAll` reruns everything.

#### [`preloadData`](https://svelte.dev/docs/kit/$app-navigation#preloadData) / [`preloadCode`](https://svelte.dev/docs/kit/$app-navigation#preloadCode)

```typescript
function preloadData(href: string): Promise<
  | { type: 'loaded'; status: number; data: Record<string, any> }
  | { type: 'redirect'; location: string }
>;
function preloadCode(pathname: string): Promise<void>;
```

Preload page code and/or data before navigation for instant transitions.

### Current Route State ([`$app/state`](https://svelte.dev/docs/kit/$app-state))

_Added in SvelteKit 2.12. For earlier versions or Svelte 4, use [`$app/stores`](https://svelte.dev/docs/kit/$app-stores)._

#### [`page`](https://svelte.dev/docs/kit/$app-state#page)

```typescript
const page: import('@sveltejs/kit').Page;
```

Reactive object containing current page information:
- `page.url` — current URL
- `page.params` — route parameters
- `page.route.id` — route pattern (e.g., `/blog/[slug]`)
- `page.status` — HTTP status code
- `page.error` — error object if in error state
- `page.data` — combined data from all load functions
- `page.form` — form action return data
- `page.state` — page state from `pushState`/`replaceState`

#### [`navigating`](https://svelte.dev/docs/kit/$app-state#navigating)

```typescript
const navigating: Navigation | {
  from: null; to: null; type: null;
  willUnload: null; delta: null; complete: null;
};
```

Reactive object tracking in-progress navigation. Non-null during navigation with properties: `from`, `to`, `type`, `willUnload`, `delta` (for popstate), `complete`.

#### [`updated`](https://svelte.dev/docs/kit/$app-state#updated)

```typescript
const updated: {
  get current(): boolean;
  check(): Promise<boolean>;
};
```

Indicates whether a new app version is available. `check()` forces an immediate version check.

### Route Information in Load Functions

Load functions receive a [`route`](https://svelte.dev/docs/kit/load#Universal-vs-server-Input) object:

```js
/// file: src/routes/a/[b]/[...c]/+page.js
/** @type {import('./$types').PageLoad} */
export function load({ route }) {
  console.log(route.id); // '/a/[b]/[...c]'
}
```

## Major Versions (Last 2 Years)

### Svelte 5.0.0 (2024-10-19)

Svelte 5 is a major rewrite of the Svelte compiler and runtime. SvelteKit 2.x supports both Svelte 4 and Svelte 5. The [release](https://github.com/sveltejs/svelte/releases/tag/svelte@5.0.0) highlights: runes-based reactivity, snippets, event attributes, and native TypeScript support.

**Breaking Changes:**

- Implicit reactivity removed — variables require explicit `$state` rune instead of bare `let` declarations
- Reactive statements (`$:`) replaced by [`$derived`](https://svelte.dev/docs/svelte/v5-migration-guide) and `$effect` runes
- Component props use `$props()` destructuring instead of `export let`
- Event directives (`on:click`) replaced by property-based handlers (`onclick`)
- `createEventDispatcher` deprecated — use callback props instead
- Event modifiers (`|once`, `|preventDefault`) removed — use wrapper functions
- Multiple event handlers on same element no longer permitted
- Slots deprecated — use `children` prop with `{@render}` snippets
- Named slots replaced with individual snippet props
- Components no longer classes — use `mount()` / `hydrate()` instead of `new Component()`
- `$set`, `$on`, `$destroy` methods removed — use `unmount()` and reactive props
- Server-side render uses `render()` from `svelte/server` instead of component method
- `<svelte:component>` no longer needed — components are dynamic by default
- `beforeUpdate` / `afterUpdate` lifecycle hooks disallowed in runes mode — use `$effect.pre()` and `$effect()`
- `:is()`, `:has()`, `:where()` CSS selectors are now scoped
- Scoped CSS uses `:where(.svelte-hash)` wrapper
- IE support dropped — requires Proxies, ResizeObserver
- `children` prop name reserved for slot content
- `null` / `undefined` render as empty string instead of literal text
- Whitespace handling simplified between nodes
- Hydration uses comment markers in server-rendered HTML
- `mount()` plays transitions by default (pass `intro: false` to prevent)
- Touch events (`ontouchstart`, `ontouchmove`) are passive by default
- Stricter HTML structure validation (e.g., `<tbody>` required in `<table>`)
- `walk` no longer exported from `svelte/compiler` — use `estree-walker` directly
- `css: false` / `css: "none"` compiler options removed — use `css: 'external'`
- `hydratable`, `enableSourcemap`, `tag`, `loopGuardTimeout`, `format`, `sveltePath` compiler options removed

No major version of **SvelteKit** was released in the last 2 years. SvelteKit 2.0.0 was released on 2023-12-14 (outside the window). The latest SvelteKit release is 2.57.1 (2026-04-09).

## Compatibility

- **compatible: true**

SvelteKit provides:
- A client-side route tree with runtime route representation (filesystem-based but with runtime `route.id` and params)
- Dynamic segment parameters (`[param]`, `[[optional]]`, `[...rest]`)
- Rich navigation lifecycle events: `beforeNavigate`, `onNavigate`, `afterNavigate` for client-side hooks; `handle` and `reroute` for server-side
- Reactive route state via `$app/state` (`page`, `navigating`, `updated`)
- Programmatic navigation via `goto`, `invalidate`, `pushState`, `replaceState`
