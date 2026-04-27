# RUM Browser Monitoring - Vue integration

**Note**: This integration is in Preview. Features and configuration are subject to change.

## Overview

The Datadog RUM Vue integration provides framework-specific instrumentation to help you monitor and debug Vue 3 applications. This integration adds:

- **Automatic route change detection** using Vue Router v4
- **View name normalization** that maps dynamic route segments to their parameterized definitions (e.g. `/users/123` becomes `/users/:id`)
- **Error reporting** through Vue's global error handler with full component stack traces
- **Full-stack visibility** by correlating frontend performance with backend traces and logs

Combined with Datadog RUM's core capabilities, you can debug performance bottlenecks, track user journeys, monitor Core Web Vitals, and analyze every user session with context.

## Setup

Start by setting up [Datadog RUM][1] in your Vue application:

- If you are creating a RUM application, select **Vue** as the application type.
- If Vue is not available as an option, select **JavaScript** and follow the steps below to integrate the plugin manually.

After configuration, the Datadog App provides instructions for integrating the [RUM-Vue plugin][2] with the Browser SDK.

This integration requires **Vue v3.5+** and **Vue Router v4+** (if using router view tracking).

## Basic usage

### 1. Initialize the Datadog RUM SDK with the Vue plugin

In your `main.ts` (or `main.js`):

```js
import { datadogRum } from '@datadog/browser-rum'
import { vuePlugin } from '@datadog/browser-rum-vue'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [vuePlugin()],
})
```

### 2. Attach the Vue error handler

Use `addVueError` as your application's global error handler to automatically report Vue errors to Datadog RUM with component stack traces:

```js
import { createApp } from 'vue'
import { addVueError } from '@datadog/browser-rum-vue'
import App from './App.vue'

const app = createApp(App)
app.config.errorHandler = addVueError
app.mount('#app')
```

## Router view tracking

To automatically track route changes as RUM views, enable the `router` option in the plugin and use the Datadog `createRouter` wrapper instead of Vue Router's native one.

### 1. Initialize the RUM SDK with router tracking enabled

```js
import { datadogRum } from '@datadog/browser-rum'
import { vuePlugin } from '@datadog/browser-rum-vue'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [vuePlugin({ router: true })],
})
```

### 2. Create your router with the Datadog wrapper

Replace Vue Router's `createRouter` with the one from `@datadog/browser-rum-vue/vue-router-v4`:

```js
import { createWebHistory } from 'vue-router'
import { createRouter } from '@datadog/browser-rum-vue/vue-router-v4'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/users', component: Users },
    { path: '/users/:id', component: UserDetail },
  ],
})
```

### 3. Wire everything together

```js
import { createApp } from 'vue'
import { createWebHistory } from 'vue-router'
import { datadogRum } from '@datadog/browser-rum'
import { vuePlugin, addVueError } from '@datadog/browser-rum-vue'
import { createRouter } from '@datadog/browser-rum-vue/vue-router-v4'
import App from './App.vue'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [vuePlugin({ router: true })],
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/users', component: Users },
    { path: '/users/:id', component: UserDetail },
  ],
})

const app = createApp(App)
app.config.errorHandler = addVueError
app.use(router)
app.mount('#app')
```

## Route tracking

The `createRouter` wrapper automatically tracks route changes and normalizes dynamic segments into parameterized view names:

| Actual URL             | View name                  |
| ---------------------- | -------------------------- |
| `/about`               | `/about`                   |
| `/users/123`           | `/users/:id`               |
| `/users/123/posts/456` | `/users/:id/posts/:postId` |
| `/docs/a/b/c`          | `/docs/:pathMatch(.*)* `   |

## Go further with Datadog Vue integration

### Traces

Connect your RUM and trace data to get a complete view of your application's performance. See [Connect RUM and Traces][3].

### Logs

To forward your Vue application's logs to Datadog, see [JavaScript Logs Collection][4].

### Metrics

To generate custom metrics from your RUM application, see [Generate Metrics][5].

## Troubleshooting

Need help? Contact [Datadog Support][6].

[1]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client
[2]: https://www.npmjs.com/package/@datadog/browser-rum-vue
[3]: https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum
[4]: https://docs.datadoghq.com/logs/log_collection/javascript/
[5]: https://docs.datadoghq.com/real_user_monitoring/generate_metrics
[6]: https://docs.datadoghq.com/help/
