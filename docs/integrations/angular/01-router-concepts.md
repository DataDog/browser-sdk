# Angular Router Concepts

## Route Definition Format

Angular uses a **configuration-object** approach. Routes are defined as an array of [`Route`](https://angular.dev/api/router/Route) objects, typically in a dedicated file (e.g., `app.routes.ts`), and registered via [`provideRouter`](https://angular.dev/api/router/provideRouter) in the application configuration.

```typescript
import { Routes } from '@angular/router';
import { HomePage } from './home-page';
import { AdminPage } from './about-page';

export const routes: Routes = [
  {
    path: '',
    component: HomePage,
  },
  {
    path: 'admin',
    component: AdminPage,
  },
];
```

Registration in application config:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
  ],
};
```

Each route object supports these [properties](https://angular.dev/guide/routing/define-routes):

| Property | Purpose |
|----------|---------|
| `path` | URL path segment to match |
| `component` | Component to render (eagerly loaded) |
| [`loadComponent`](https://angular.dev/guide/routing/loading-strategies) | Lazy-loaded component via dynamic `import()` |
| [`loadChildren`](https://angular.dev/guide/routing/loading-strategies) | Lazy-loaded child routes via dynamic `import()` |
| `children` | Nested child route array |
| `redirectTo` | Redirect target (string or function since v18) |
| `pathMatch` | Matching strategy: `'full'` or `'prefix'` |
| `title` | Page title (string or `ResolveFn<string>`) |
| `data` | Static data attached to the route |
| `resolve` | Map of data resolvers |
| [`canActivate`](https://angular.dev/guide/routing/route-guards) | Guards controlling route access |
| [`canActivateChild`](https://angular.dev/guide/routing/route-guards) | Guards controlling child route access |
| [`canDeactivate`](https://angular.dev/guide/routing/route-guards) | Guards controlling route exit |
| [`canMatch`](https://angular.dev/guide/routing/route-guards) | Guards controlling whether route participates in matching |
| `outlet` | Named outlet this route renders into |
| `providers` | Route-scoped dependency injection providers |
| `matcher` | Custom [`UrlMatcher`](https://angular.dev/guide/routing/routing-with-urlmatcher) function |

Angular uses a **first-match wins** strategy — routes are evaluated in [declaration order](https://angular.dev/guide/routing/define-routes), and once a match occurs, subsequent routes are not checked.

## Dynamic Segment Syntax

Angular uses the **colon prefix** (`:paramName`) for [dynamic route segments](https://angular.dev/guide/routing/define-routes):

```typescript
const routes: Routes = [
  { path: 'user/:id', component: UserProfile },
  { path: 'user/:id/:social-media', component: SocialMediaFeed },
];
```

Valid parameter names must start with a letter and may contain: letters, numbers, underscore (`_`), or hyphen (`-`).

Parameters are accessed via [`ActivatedRoute`](https://angular.dev/guide/routing/read-route-state):

```typescript
// Snapshot (one-time read)
this.route.snapshot.paramMap.get('id');

// Observable (reactive updates)
this.route.params.subscribe(params => {
  const id = params['id'];
});
```

Angular also supports [matrix parameters](https://angular.dev/guide/routing/read-route-state) using semicolons:

```typescript
this.router.navigate(['/products', { view: 'grid', filter: 'new' }]);
// URL: /products;view=grid;filter=new
```

## Catch-All / Wildcard Syntax

Angular uses the **double asterisk** (`**`) for [wildcard routes](https://angular.dev/guide/routing/define-routes):

```typescript
const routes: Routes = [
  { path: 'home', component: Home },
  { path: 'user/:id', component: UserProfile },
  { path: '**', component: NotFound },
];
```

Wildcard routes must be positioned **last** in the array — they match any URL not matched by preceding routes.

Angular does not have a dedicated "catch-all segments" syntax like `[...slug]`. The `**` wildcard matches the entire remaining URL; there is no partial catch-all for a single segment position. For custom matching logic, use [`UrlMatcher`](https://angular.dev/guide/routing/routing-with-urlmatcher).

## Navigation Lifecycle Hooks

Angular's router emits a detailed sequence of [events](https://angular.dev/guide/routing/router-reference) through `Router.events` (an `Observable<Event>`). Listed below in firing order:

| # | Event | Description | Can Cancel/Redirect |
|---|-------|-------------|---------------------|
| 1 | [`NavigationStart`](https://angular.dev/api/router/NavigationStart) | Navigation begins. Contains `id`, `url`, `navigationTrigger` (`'imperative'` \| `'popstate'` \| `'hashchange'`), and `restoredState` for back/forward navigations. | No (too early) |
| 2 | [`RouteConfigLoadStart`](https://angular.dev/api/router/RouteConfigLoadStart) | Before lazy-loading a route configuration via `loadChildren`/`loadComponent`. | No |
| 3 | [`RouteConfigLoadEnd`](https://angular.dev/api/router/RouteConfigLoadEnd) | After a route configuration has been lazy-loaded. | No |
| 4 | [`RoutesRecognized`](https://angular.dev/api/router/RoutesRecognized) | URL parsed and routes matched. Contains `urlAfterRedirects` and the matched `state` (RouterStateSnapshot). | No |
| 5 | [`GuardsCheckStart`](https://angular.dev/api/router/GuardsCheckStart) | Router begins evaluating guards (`canActivate`, `canActivateChild`, `canDeactivate`, `canMatch`). | No (event only) |
| 6 | [`ChildActivationStart`](https://angular.dev/api/router/ChildActivationStart) | Router begins activating a route's children. | No |
| 7 | [`ActivationStart`](https://angular.dev/api/router/ActivationStart) | Router begins activating a specific route. Contains the `ActivatedRouteSnapshot`. | No |
| 8 | [`GuardsCheckEnd`](https://angular.dev/api/router/GuardsCheckEnd) | Guards phase completed successfully. Contains `shouldActivate: boolean`. | Guards themselves can cancel/redirect by returning `false`, `UrlTree`, or `RedirectCommand` |
| 9 | [`ResolveStart`](https://angular.dev/api/router/ResolveStart) | Router begins resolving route data via `resolve` functions. | No (event only) |
| 10 | [`ResolveEnd`](https://angular.dev/api/router/ResolveEnd) | Resolvers completed successfully. | Resolvers can redirect by returning `RedirectCommand` |
| 11 | [`ChildActivationEnd`](https://angular.dev/api/router/ChildActivationEnd) | Router finishes activating child routes. | No |
| 12 | [`ActivationEnd`](https://angular.dev/api/router/ActivationEnd) | Router finishes activating a route. Contains the `ActivatedRouteSnapshot`. | No |
| 13 | [`NavigationEnd`](https://angular.dev/api/router/NavigationEnd) | Navigation completed successfully. Contains `id`, `url`, and `urlAfterRedirects`. | No |
| — | [`NavigationCancel`](https://angular.dev/api/router/NavigationCancel) | Navigation canceled (guard returned false, redirect, etc.). Contains `reason` (debug string) and `code` ([`NavigationCancellationCode`](https://angular.dev/api/router/NavigationCancellationCode)). | — |
| — | [`NavigationError`](https://angular.dev/api/router/NavigationError) | Navigation failed due to unexpected error. | — |
| — | [`NavigationSkipped`](https://angular.dev/api/router/NavigationSkipped) | Navigation was skipped (e.g., same-URL navigation). | — |
| — | [`Scroll`](https://angular.dev/api/router/Scroll) | Scroll event after navigation. | — |

### Guard Types

| Guard | When it runs | Arguments | Can cancel/redirect |
|-------|-------------|-----------|---------------------|
| [`canMatch`](https://angular.dev/guide/routing/route-guards) | During route matching, before route is selected | `(route: Route, segments: UrlSegment[])` | Yes — `false` skips this route and tries alternatives; `UrlTree`/`RedirectCommand` redirects |
| [`canActivate`](https://angular.dev/guide/routing/route-guards) | After matching, before activation | `(route: ActivatedRouteSnapshot, state: RouterStateSnapshot)` | Yes — `false` blocks; `UrlTree`/`RedirectCommand` redirects |
| [`canActivateChild`](https://angular.dev/guide/routing/route-guards) | Before activating child routes | `(childRoute: ActivatedRouteSnapshot, state: RouterStateSnapshot)` | Yes — same as canActivate |
| [`canDeactivate`](https://angular.dev/guide/routing/route-guards) | Before leaving current route | `(component: T, currentRoute, currentState, nextState)` | Yes — `false` blocks navigation |

Guards return `boolean`, `UrlTree`, `RedirectCommand`, `Promise<T>`, or `Observable<T>`.

### Resolvers

[`ResolveFn<T>`](https://angular.dev/api/router/ResolveFn) executes after guards succeed, before route activation:

```typescript
const heroResolver: ResolveFn<Hero> = (route, state) => {
  return inject(HeroService).getHero(route.paramMap.get('id'));
};

const routes: Routes = [
  {
    path: 'hero/:id',
    component: HeroDetail,
    resolve: { hero: heroResolver },
  },
];
```

Resolved data is available via `ActivatedRoute.data` observable or component input binding (with `withComponentInputBinding`).

## Navigation Lifecycle Timing

A complete navigation follows this ordered sequence:

```
1. NavigationStart
   │
2. RouteConfigLoadStart / RouteConfigLoadEnd  (if lazy routes need loading)
   │
3. RoutesRecognized                           (URL → route tree matched)
   │                                          Redirects from `redirectTo` resolved here
   │
4. GuardsCheckStart
   │  ├─ canMatch guards evaluate             (can skip route or redirect)
   │  ├─ canDeactivate guards evaluate        (can block leaving current route)
   │  ├─ canActivateChild guards evaluate     (parent → child order)
   │  └─ canActivate guards evaluate
   │
5. GuardsCheckEnd                             (guards passed)
   │
6. ResolveStart
   │  └─ resolve functions execute            (parent resolvers → child resolvers)
   │     Can return RedirectCommand to redirect
   │
7. ResolveEnd                                 (data resolved)
   │
8. ActivationStart / ChildActivationStart     (component instantiation begins)
   │
9. ActivationEnd / ChildActivationEnd         (components rendered)
   │
10. NavigationEnd                              (navigation complete)
    │
11. Scroll                                     (scroll position restored/reset)
```

**Key ordering rules:**
- **Redirects** from `redirectTo` resolve during route recognition (step 3), before guards
- **Guard redirects** (returning `UrlTree`/`RedirectCommand`) cancel current navigation and start a new one
- **Guards** all run and succeed before any **resolvers** execute
- For nested routes: parent guards → child guards → parent resolvers → child resolvers
- **Component rendering** begins only after all resolvers complete
- When a guard returns `UrlTree` for redirect, the redirecting navigation uses `replaceUrl` (since v18)

## Route Matching Model

Angular uses a **nested (tree-based)** route matching model.

### Nested Routes

Routes form a tree via the `children` property. Each level renders into its own [`<router-outlet>`](https://angular.dev/guide/routing/show-routes-with-outlets):

```typescript
const routes: Routes = [
  {
    path: 'product/:id',
    component: Product,
    children: [
      { path: 'info', component: ProductInfo },
      { path: 'reviews', component: ProductReviews },
    ],
  },
];
```

```html
<!-- Product component template -->
<article>
  <h1>Product {{ id }}</h1>
  <router-outlet />
</article>
```

Navigating between child routes only updates the nested outlet — the parent component persists.

### Named Outlets (Secondary Routes)

Multiple [`RouterOutlet`](https://angular.dev/guide/routing/show-routes-with-outlets) instances can coexist using the `name` property:

```html
<router-outlet />                        <!-- primary outlet -->
<router-outlet name="sidebar" />         <!-- named outlet -->
```

Routes target named outlets via the `outlet` property:

```typescript
{ path: 'help', component: HelpPanel, outlet: 'sidebar' }
```

### Outlet Lifecycle Events

[`RouterOutlet`](https://angular.dev/guide/routing/show-routes-with-outlets) emits four lifecycle events:
- `activate` — component instantiated
- `deactivate` — component destroyed
- `attach` — `RouteReuseStrategy` attaches subtree
- `detach` — `RouteReuseStrategy` detaches subtree

### Route-Level Providers

Routes support scoped [dependency injection](https://angular.dev/guide/routing/define-routes) via the `providers` property:

```typescript
const routes: Routes = [
  {
    path: 'admin',
    providers: [AdminService, { provide: ADMIN_API_KEY, useValue: '12345' }],
    children: [
      { path: 'users', component: AdminUsers },
      { path: 'teams', component: AdminTeams },
    ],
  },
];
```

### Custom URL Matching

For advanced matching beyond static/dynamic paths, Angular supports [`UrlMatcher`](https://angular.dev/guide/routing/routing-with-urlmatcher):

```typescript
{
  matcher: (url) => {
    if (url.length === 1 && url[0].path.match(/^@[\w]+$/gm)) {
      return {
        consumed: url,
        posParams: { username: new UrlSegment(url[0].path.slice(1), {}) },
      };
    }
    return null;
  },
  component: Profile,
}
```

## Programmatic Navigation API

### Router Service

The [`Router`](https://angular.dev/api/router/Router) service is the primary API for programmatic navigation:

```typescript
import { Router } from '@angular/router';

private router = inject(Router);
```

**Key properties:**

| Property | Type | Description |
|----------|------|-------------|
| [`events`](https://angular.dev/api/router/Router) | `Observable<Event>` | Stream of all router navigation events |
| [`url`](https://angular.dev/api/router/Router) | `string` | Current URL |
| [`routerState`](https://angular.dev/api/router/Router) | `RouterState` | Current router state tree |
| [`config`](https://angular.dev/api/router/Router) | `Routes` | Route configuration array |
| [`navigated`](https://angular.dev/api/router/Router) | `boolean` | Whether at least one navigation has occurred |
| [`currentNavigation`](https://angular.dev/api/router/Router) | `Signal<Navigation \| null>` | Signal of current in-flight navigation |
| [`lastSuccessfulNavigation`](https://angular.dev/api/router/Router) | `Signal<Navigation \| null>` | Signal of last completed navigation (signal since v21) |

**Navigation methods:**

[`navigate(commands, extras?)`](https://angular.dev/guide/routing/navigate-to-routes) — array-based navigation:

```typescript
this.router.navigate(['/profile']);
this.router.navigate(['/users', userId]);
this.router.navigate(['/search'], { queryParams: { category: 'books' } });
this.router.navigate(['edit'], { relativeTo: this.route }); // relative navigation
```

[`navigateByUrl(url, extras?)`](https://angular.dev/guide/routing/navigate-to-routes) — string-based navigation:

```typescript
this.router.navigateByUrl('/products');
this.router.navigateByUrl('/products/123?view=details#reviews');
this.router.navigateByUrl('/checkout', { replaceUrl: true });
this.router.navigateByUrl('/not-found', { browserUrl: '/products/missing-item' });
```

Both return `Promise<boolean>` indicating navigation success.

[`createUrlTree(commands, extras?)`](https://angular.dev/api/router/Router) — creates a `UrlTree` without navigating.

[`isActive(url, matchOptions)`](https://angular.dev/api/router/Router) — checks if a URL is currently active (deprecated in favor of standalone [`isActive`](https://angular.dev/api/router/isActive) function).

### ActivatedRoute Service

[`ActivatedRoute`](https://angular.dev/guide/routing/read-route-state) provides route-specific state for the currently rendered component:

| Property | Type | Description |
|----------|------|-------------|
| `url` | `Observable<UrlSegment[]>` | Route path segments |
| `params` | `Observable<Params>` | Route parameters (dynamic segments + matrix params) |
| `queryParams` | `Observable<Params>` | Query parameters (shared across all routes) |
| `data` | `Observable<Data>` | Static `data` + resolved values |
| `snapshot` | `ActivatedRouteSnapshot` | One-time snapshot of all above |
| `paramMap` | `Observable<ParamMap>` | Map interface for route params |
| `queryParamMap` | `Observable<ParamMap>` | Map interface for query params |

### Component Input Binding

With [`withComponentInputBinding()`](https://angular.dev/guide/routing/read-route-state), route params, query params, data, and resolved values are automatically bound to component inputs:

```typescript
// app.config.ts
provideRouter(routes, withComponentInputBinding())

// component
@Component({ ... })
export class UserProfile {
  id = input.required<string>(); // auto-bound from :id param
}
```

### Declarative Navigation

[`RouterLink`](https://angular.dev/guide/routing/navigate-to-routes) directive for template-based navigation:

```html
<a routerLink="/user-profile">Profile</a>
<a [routerLink]="['/user', currentUserId]">User</a>
<a [routerLink]="['/dashboard']" [browserUrl]="'/home'">Dashboard</a>
```

[`RouterLinkActive`](https://angular.dev/guide/routing/read-route-state) directive for styling active links:

```html
<a routerLink="/settings" routerLinkActive="active-button" ariaCurrentWhenActive="page">
  Settings
</a>
```

## Major Versions (Last 2 Years)

### v18.0.0 (2024-05-22)

**Breaking Changes:**

- Deprecated `matchesElement` method removed from `AnimationDriver` ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Deprecated `isPlatformWorkerUi` and `isPlatformWorkerApp` removed ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Angular only supports writable expressions inside two-way bindings ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Angular no longer supports TypeScript versions older than 5.4 ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- `OnPush` views at root need to be marked dirty for host bindings to refresh ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- `ComponentFixture` `autoDetect` no longer refreshes OnPush host view when not dirty ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- `ComponentFixture.whenStable` now matches `ApplicationRef.isStable` observable ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Angular ensures change detection runs even when state update originates outside the zone ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- `async` removed, use `waitForAsync` instead ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- `ComponentFixture.autoDetect` now executes change detection within `ApplicationRef.tick` ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Exact timing of change detection with event/run coalescing in `NgZone` changed ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Newly created views marked for check during change detection are guaranteed to be refreshed ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Testability methods `increasePendingRequestCount`, `decreasePendingRequestCount`, `getPendingRequestCount` removed ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- HTTP requests requiring authorization now prevent caching by default ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Deprecated `StateKey`, `TransferState`, `makeStateKey` removed from `@angular/platform-browser` ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- `RESOURCE_CACHE_PROVIDER` APIs removed ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- Multiple `platform-server` deprecations removed (`platformDynamicServer`, `ServerTransferStateModule`, `useAbsoluteUrl`, `baseUrl`) ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- **Router:** Guards can now return `RedirectCommand` for redirects in addition to `UrlTree` ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- **Router:** `Route.redirectTo` can now be a function in addition to string ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- **Router:** When a guard returns a `UrlTree` as redirect, the redirecting navigation now uses `replaceUrl` ([source](https://github.com/angular/angular/releases/tag/18.0.0))
- **Router:** Providers available to routed components always come from the injector hierarchy of the routes ([source](https://github.com/angular/angular/releases/tag/18.0.0))

### v19.0.0 (2024-11-19)

**Breaking Changes:**

- `this.foo` property reads no longer refer to template context variables ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- Directives, components, and pipes are now standalone by default. Specify `standalone: false` for NgModule declarations ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- TypeScript versions less than 5.5 no longer supported ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- Effects triggered outside change detection run as part of change detection process instead of microtask ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- Effects triggered during change detection run earlier, before component template ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- `ExperimentalPendingTasks` renamed to `PendingTasks` ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- `ComponentFixture` autoDetect now attaches fixture to `ApplicationRef` ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- `createComponent` renders default fallback with empty `projectableNodes` ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- Errors thrown during `ApplicationRef.tick` rethrown when using `TestBed` ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- Timers for zone coalescing and hybrid mode scheduling run in zone above Angular ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- Deprecated `factories` property in `KeyValueDiffers` removed ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- Change detection timing around custom elements changed due to hybrid scheduler ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- `name` option in `ng add @localize` removed in favor of `project` ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- Deprecated `BrowserModule.withServerTransition` removed, use `APP_ID` token instead ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- **Router:** `Router.errorHandler` property removed. Use `withNavigationErrorHandler` or `RouterModule.forRoot` ([source](https://github.com/angular/angular/releases/tag/19.0.0))
- **Router:** `Resolve` interface return type now includes `RedirectCommand` ([source](https://github.com/angular/angular/releases/tag/19.0.0))

### v20.0.0 (2025-05-28)

**Breaking Changes:**

- `Y` date formatter without `w` now detected as suspicious pattern ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `AsyncPipe` now directly catches unhandled errors and reports to `ErrorHandler` ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `in` in expression now refers to the operator ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `void` in expression now refers to the operator ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- TypeScript versions less than 5.8 no longer supported ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `TestBed.flushEffects()` removed, use `TestBed.tick()` instead ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `provideExperimentalCheckNoChangesForDebug` renamed to `provideCheckNoChangesConfig` with behavior changes ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `provideExperimentalZonelessChangeDetection` renamed to `provideZonelessChangeDetection` ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `InjectFlags` removed from `inject`, `Injector.get`, `EnvironmentInjector.get`, `TestBed.get`, `TestBed.inject` ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `TestBed.get` removed, use `TestBed.inject` instead ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `afterRender` renamed to `afterEveryRender` ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- Node.js v18 no longer supported; Node.js 22.0–22.10 also dropped ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `PendingTasks.run` no longer returns result of the async function ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- Uncaught errors in listeners now also reported to Angular internal error handling ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `any` overload removed from `injector.get` ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- Animations guaranteed to be flushed during automatic change detection ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `ApplicationRef.tick` no longer catches/reports errors to `ErrorHandler`; errors thrown out of method ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- `ng-reflect-*` attributes deprecated and no longer produced by default ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- **Router:** `RedirectFn` can now return `Observable` or `Promise` ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- **Router:** Several methods updated to accept `readonly` arrays instead of writable arrays ([source](https://github.com/angular/angular/releases/tag/20.0.0))
- **Router:** Guards arrays on `Route` no longer include `any` in the type union ([source](https://github.com/angular/angular/releases/tag/20.0.0))

### v21.0.0 (2025-11-19)

**Breaking Changes:**

- `TestBed` now provides fake `PlatformLocation` with Navigation API support ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- `ngComponentOutletContent` type changed to `Node[][] | undefined` ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- `NgModuleFactory` removed, use `NgModule` instead ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- Previously hidden type issues in host bindings may surface in builds ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- Angular compiler now errors when `emitDeclarationOnly` TS option is enabled ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- Server-side bootstrapping changed to eliminate reliance on global platform injector ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- `provideZoneChangeDetection` without ZoneJS polyfills no longer disables internal scheduler ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- TypeScript versions less than 5.9 no longer supported ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- `provideZoneChangeDetection` in TestBed no longer prevents error rethrowing ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- `ignoreChangesOutsideZone` option removed ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- Angular no longer provides change detection scheduler for ZoneJS by default; add `provideZoneChangeDetection` explicitly ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- `moduleId` removed from Component metadata ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- `interpolation` option on Components removed; only `{{ ... }}` supported ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- Signal inputs in custom elements now accessed directly ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- New FormArray directive conflicts with existing `formArray` inputs on same element ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- Deprecated `ApplicationConfig` export from `@angular/platform-browser` removed ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- **Router:** `lastSuccessfulNavigation` is now a signal and needs to be invoked ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- **Router:** Navigations may take several additional microtasks to complete ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- `UpgradeAdapter` removed, use `upgrade/static` instead ([source](https://github.com/angular/angular/releases/tag/21.0.0))
- zone.js: IE/Non-Chromium Edge no longer supported ([source](https://github.com/angular/angular/releases/tag/21.0.0))

## Compatibility

- `compatible: true`

Angular provides all required capabilities for a router integration:
- **Client-side route tree**: Configuration-object-based route definitions with full runtime `RouterState` representation
- **Dynamic segment parameters**: `:paramName` syntax with `ActivatedRoute` access
- **Navigation lifecycle events**: 17 distinct router events through `Router.events` observable, including `NavigationStart`, `NavigationEnd`, `NavigationCancel`, `NavigationError`, `RoutesRecognized`, guards, and resolvers
- **Route matching**: First-match-wins with nested tree structure, named outlets, and custom `UrlMatcher` support
