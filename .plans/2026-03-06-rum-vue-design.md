# Design: `@datadog/browser-rum-vue`

**Date:** 2026-03-06
**Branch:** `adlrb/vue`

## Overview

A new `rum-vue` package that brings Datadog Browser RUM integration to Vue 3 applications, with full parity to `rum-react`. The package provides three capabilities: error tracking, Vue Router v4 integration, and component performance tracking.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Vue version | Vue 3 only | Vue 2 is EOL; Vue Router v4 targets Vue 3 |
| Vue Router version | v4 only | v3 (Vue 2) is not worth the maintenance cost |
| Component tracker API | Composable (`useVueComponentTracker`) | Vue 3 idiomatic; Vue docs discourage global mixins |
| App instance access | Not required at plugin init | Consistent with `rum-react` / `rum-nextjs` which never require the framework root |
| Error handler wiring | User assigns `app.config.errorHandler = addVueError` | Mirrors `addReactError`; `addVueError` signature matches Vue's errorHandler exactly so it can be assigned directly |
| Router integration | Wrapped `createRouter` export | Mirrors `rum-react`'s wrapped `createBrowserRouter` pattern |
| Sample app build tool | Vite | Official Vue 3 tooling; precedent in repo: `nextjs-app-router` uses Next.js build, not webpack |

## Section 1: Package structure

```
packages/rum-vue/
├── package.json                      # @datadog/browser-rum-vue
├── vue-router/
│   └── package.json                  # sub-entry: @datadog/browser-rum-vue/vue-router
├── src/
│   ├── entries/
│   │   ├── main.ts                   # vuePlugin, addVueError, UNSTABLE_useVueComponentTracker
│   │   └── vueRouter.ts              # wrapped createRouter
│   └── domain/
│       ├── vuePlugin.ts
│       ├── error/
│       │   └── addVueError.ts
│       ├── router/
│       │   └── vueRouter.ts
│       └── performance/
│           └── useVueComponentTracker.ts
└── test/
```

`package.json` peer dependencies: `vue: ^3.0.0`, `vue-router: ^4.0.0` (both optional, matching the pattern in `rum-react` where `react-router` is optional).

The `vue-router/package.json` sub-entry points to `../cjs/entries/vueRouter.js`, identical to how `react-router-v6/package.json` works.

## Section 2: Plugin architecture (`vuePlugin`)

Follows the identical module-level subscriber pattern as `reactPlugin` and `nextjsPlugin` — no Vue app instance required at init time.

```ts
export interface VuePluginConfiguration {
  router?: boolean
}

export function vuePlugin(configuration: VuePluginConfiguration = {}): VuePlugin {
  return {
    name: 'vue',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      globalConfiguration = configuration
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }
      for (const subscriber of onRumInitSubscribers) {
        subscriber(configuration, publicApi)
      }
    },
    onRumStart({ addEvent }) {
      globalAddEvent = addEvent
      for (const subscriber of onRumStartSubscribers) {
        subscriber(addEvent)
      }
    },
    getConfigurationTelemetry() {
      return { router: !!configuration.router }
    },
  }
}
```

Internal `onVueInit` / `onVueStart` hooks use the deferred-subscriber pattern: if RUM is already initialized when a subscriber registers, it fires immediately; otherwise it queues. This is the same pattern used by `addReactError` and `addDurationVital` to avoid timing races.

## Section 3: Error handling (`addVueError`)

Vue surfaces errors through `app.config.errorHandler(err, instance, info)` where `instance` is the component instance and `info` is a Vue-specific string describing the error source (e.g. `"setup function"`, `"v-on handler"`).

The `addVueError` signature matches Vue's error handler exactly, enabling direct assignment:

```ts
// Direct assignment — no wrapper needed
app.config.errorHandler = addVueError

// Or inline to add custom logic
app.config.errorHandler = (err, instance, info) => {
  addVueError(err, instance, info)
  myOwnHandler(err)
}
```

Internally mirrors `addReactError`:
- Calls `onVueStart` to queue until RUM is running
- Emits `RumEventType.ERROR` with `source: ErrorSource.CUSTOM`, `handling: ErrorHandling.HANDLED`
- Sets `context: { framework: 'vue' }` (parallel to `framework: 'react'`)
- Stores Vue's `info` string in `component_stack`

**Limitation:** Vue's `info` is a plain description string (e.g. `"mounted hook"`), not a component stack trace like React's `componentStack`. This is documented.

## Section 4: Vue Router integration (`@datadog/browser-rum-vue/vue-router`)

Users replace only the `createRouter` import — everything else stays from `vue-router`:

```ts
// Before
import { createRouter, createWebHistory } from 'vue-router'

// After
import { createRouter } from '@datadog/browser-rum-vue/vue-router'
import { createWebHistory } from 'vue-router'
```

The wrapped `createRouter` calls the original, then registers `router.afterEach((to) => startVueRouterView(to.matched))`. On each navigation, `startVueRouterView` computes a view name from the matched route records and calls `rumPublicApi.startView(viewName)`.

**View name computation** follows the same algorithm as `startReactRouterView`:
- Iterate `matched` records, concatenate `record.path` values
- Keep param names (`:id`) not actual values — `/users/42` becomes `/users/:id`
- Nested routes are concatenated: child `path: 'posts'` under parent `path: '/users/:id'` produces `/users/:id/posts`

**Guard:** `vuePlugin({ router: true })` is still required to set `trackViewsManually: true` at init. If omitted, a warning is logged — same guard pattern as `rum-react`.

## Section 5: Component performance tracking (`UNSTABLE_useVueComponentTracker`)

Called inside `<script setup>` to measure mount and update duration:

```ts
// MyComponent.vue
<script setup>
import { UNSTABLE_useVueComponentTracker } from '@datadog/browser-rum-vue'

UNSTABLE_useVueComponentTracker('MyComponent')
</script>
```

Uses Vue lifecycle hooks to bracket the two phases:

- **Mount:** `onBeforeMount` starts timer → `onMounted` stops timer → emits `vueComponentRender` vital with `{ is_first_render: true, framework: 'vue' }`
- **Update:** `onBeforeUpdate` starts timer → `onUpdated` stops timer → emits `vueComponentRender` vital with `{ is_first_render: false, framework: 'vue' }`

Vital name `vueComponentRender` keeps parity with `reactComponentRender`, making cross-framework dashboards straightforward.

Marked `UNSTABLE_` to match the React counterpart and signal the API may change.

## Section 6: Sample application (`test/apps/vue-router-app`)

Uses Vite with `@vitejs/plugin-vue` — Vue 3's official tooling. Follows the same "framework-native build tool" precedent as `nextjs-app-router`.

**Structure:**
```
test/apps/vue-router-app/
├── package.json          # vue, vue-router, vite, @vitejs/plugin-vue
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.ts
    ├── App.vue           # root layout with <RouterView>
    └── pages/
        ├── HomePage.vue      # nav links
        ├── UserPage.vue      # route param (:id)
        ├── TrackedPage.vue   # uses UNSTABLE_useVueComponentTracker
        └── ErrorPage.vue     # button that triggers error via app.config.errorHandler
```

**`src/main.ts`** demonstrates all three features:

```ts
import { createApp } from 'vue'
import { createWebHistory } from 'vue-router'
import { createRouter } from '@datadog/browser-rum-vue/vue-router'
import { datadogRum } from '@datadog/browser-rum'
import { vuePlugin, addVueError } from '@datadog/browser-rum-vue'
import App from './App.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/HomePage.vue') },
    { path: '/user/:id', component: () => import('./pages/UserPage.vue') },
    { path: '/tracked', component: () => import('./pages/TrackedPage.vue') },
    { path: '/error', component: () => import('./pages/ErrorPage.vue') },
  ],
})

datadogRum.init({
  ...window.RUM_CONFIGURATION,
  plugins: [vuePlugin({ router: true })],
})

const app = createApp(App)
app.config.errorHandler = addVueError
app.use(router).mount('#app')
```

`resolutions` in `package.json` point to local `.tgz` files — identical to the other test apps.

## Testing strategy

- Unit tests co-located as `*.spec.ts` files using existing Jasmine/Karma setup
- Vue Test Utils added as `devDependency` for composable and component tests
- Coverage mirrors `rum-react`:
  - View name computation (nested routes, params, edge cases)
  - Error event shape (`framework: 'vue'`, `component_stack` from `info` string)
  - Duration vital shape (`vueComponentRender`, `is_first_render`, `framework: 'vue'`)
  - Deferred-subscriber race conditions (RUM init before/after subscriber registration)
  - Warning when router integration used without `router: true` plugin config
