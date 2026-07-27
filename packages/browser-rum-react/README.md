# RUM Browser Monitoring - React integration

## Overview

With the Datadog RUM React integration, resolve performance issues quickly in React components by:

- Debugging the root cause of performance bottlenecks, such as a slow server response time, render-blocking resource, or an error inside a component
- Automatically correlating web performance data with user journeys, HTTP calls, and logs
- Alerting your engineering teams when crucial web performance metrics (such as Core Web Vitals) fall below a threshold that results in a poor user experience

Monitor your React applications from end-to-end by:

- Tracking and visualizing user journeys across your entire stack
- Debugging the root cause of slow load times, which may be an issue with your React code, network performance, or underlying infrastructure
- Analyzing and contextualizing every user session with attributes such as user ID, email, name, and more
- Unifying full-stack monitoring in one platform for frontend and backend development teams

## Setup

Start by setting up [Datadog RUM][1] in your React application. If you're creating a new RUM application in the Datadog App, select React as the application type. If you already have an existing RUM application, you can update its type to React instead. Once configured, the Datadog App will provide instructions for integrating the [RUM-React plugin][2] with the Browser SDK.

This integration supports **React v18 or v19**.

## Error Tracking

To track React component rendering errors, use one of the following:

- An `ErrorBoundary` component (see [React documentation][3]) that catches errors and reports them to Datadog.
- A function that you can use to report errors from your own `ErrorBoundary` component.

### `ErrorBoundary` usage

```javascript
import { ErrorBoundary } from '@datadog/browser-rum-react'

function App() {
  return (
    <ErrorBoundary fallback={ErrorFallback}>
      <MyComponent />
    </ErrorBoundary>
  )
}

function ErrorFallback({ resetError, error }) {
  return (
    <p>
      Oops, something went wrong! <strong>{String(error)}</strong> <button onClick={resetError}>Retry</button>
    </p>
  )
}
```

### Reporting React errors from your own `ErrorBoundary`

```javascript
import { addReactError } from '@datadog/browser-rum-react'

class MyErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    addReactError(error, errorInfo)
  }

  render() {
    // ...
  }
}
```

## React 19 `createRoot` Error Handling

React 19 introduced new error handling options for `createRoot` that can help capture errors more effectively. You can configure these options to work with Datadog RUM error tracking. See the [createRoot documentation](https://react.dev/reference/react-dom/client/createRoot#parameters) for more details:

```javascript
import { createRoot } from 'react-dom/client'
import { addReactError } from '@datadog/browser-rum-react'

const container = document.getElementById('root')
const root = createRoot(container, {
  onUncaughtError: (error, errorInfo) => {
    // Report uncaught errors to Datadog
    addReactError(error, errorInfo)
    console.error('Uncaught error:', error, errorInfo)
  },
  onCaughtError: (error, errorInfo) => {
    // Report caught errors to Datadog
    addReactError(error, errorInfo)
    console.error('Caught error:', error, errorInfo)
  },
  onRecoverableError: (error, errorInfo) => {
    // Report recoverable errors to Datadog
    addReactError(error, errorInfo)
    console.warn('Recoverable error:', error, errorInfo)
  },
})

root.render(<App />)
```

These options provide comprehensive error coverage:

- `onUncaughtError`: Captures errors that would normally cause the app to crash
- `onCaughtError`: Captures errors that are caught by error boundaries
- `onRecoverableError`: Captures errors that React can recover from (like hydration mismatches)

## React Router integration

React Router v6, v7, and v8 allow you to declare routes using the following methods:

- Create routers with [`createMemoryRouter`][4], [`createHashRouter`][5], or [`createBrowserRouter`][6] functions.
- Use the [`useRoutes`][7] hook.
- Use the [`Routes`][8] component.

To track route changes with the Datadog RUM Browser SDK, first initialize the `reactPlugin` with the `router: true` option, then replace those functions with their equivalent from the matching Datadog entry point. The version-agnostic entry point targets the latest supported React Router version:

| Supported React Router version | Entry point                                  | Usage            |
| ------------------------------ | -------------------------------------------- | ---------------- |
| Latest (currently v8)          | `@datadog/browser-rum-react/react-router`    | Recommended      |
| v8                             | `@datadog/browser-rum-react/react-router-v8` | Version-specific |
| v7                             | `@datadog/browser-rum-react/react-router-v7` | Version-specific |
| v6                             | `@datadog/browser-rum-react/react-router-v6` | Version-specific |

```javascript
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'
// Use "createBrowserRouter" from @datadog/browser-rum-react/react-router instead of react-router:
import { createBrowserRouter } from '@datadog/browser-rum-react/react-router'

datadogRum.init({
  // ...
  plugins: [reactPlugin({ router: true })],
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    // ...
  },
])

createRoot(document.getElementById('root')).render(<RouterProvider router={router} />)
```

## TanStack Router integration

[TanStack Router][14] v1.64.0 or later is a typesafe router for React. To track route changes with the Datadog RUM Browser SDK, first initialize the `reactPlugin` with the `router: true` option, then replace `createRouter` from `@tanstack/react-router` with its equivalent from `@datadog/browser-rum-react/tanstack-router`. Example:

```javascript
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'
// Use "createRouter" from @datadog/browser-rum-react/tanstack-router instead of @tanstack/react-router:
import { createRouter } from '@datadog/browser-rum-react/tanstack-router'

datadogRum.init({
  // ...
  plugins: [reactPlugin({ router: true })],
})

const router = createRouter({ routeTree })

createRoot(document.getElementById('root')).render(<RouterProvider router={router} />)
```

RUM creates a new view on every path change. The view name uses the route's `fullPath` template, so navigating to `/posts/42` is reported as `/posts/$postId`. Catch-all (splat) segments are replaced with the matched path, so `/files/$` with `_splat = "path/to/file"` becomes `/files/path/to/file`. Query string changes do not create a new view.

## Go further with Datadog React integration

### Traces

Connect your RUM and trace data to get a complete view of your application's performance. See [Connect RUM and Traces][9].

### Logs

To start forwarding your React application's logs to Datadog, see [JavaScript Logs Collection][10].

### Metrics

To generate custom metrics from your RUM application, see [Generate Metrics][11].

## Troubleshooting

Need help? Contact [Datadog Support][12].

## Further Reading

Additional helpful documentation, links, and articles:

- [React Monitoring][13]

[1]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client
[2]: https://www.npmjs.com/package/@datadog/browser-rum-react
[3]: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
[4]: https://reactrouter.com/en/main/routers/create-memory-router
[5]: https://reactrouter.com/en/main/routers/create-hash-router
[6]: https://reactrouter.com/en/main/routers/create-browser-router
[7]: https://reactrouter.com/en/main/hooks/use-routes
[8]: https://reactrouter.com/en/main/components/routes
[9]: https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum
[10]: https://docs.datadoghq.com/logs/log_collection/javascript/
[11]: https://docs.datadoghq.com/real_user_monitoring/generate_metrics
[12]: https://docs.datadoghq.com/help/
[13]: https://www.datadoghq.com/blog/datadog-rum-react-components/
[14]: https://tanstack.com/router/latest
