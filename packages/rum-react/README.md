# RUM Browser Monitoring - React integration

> [!CAUTION]
> This package is experimental. Use at your own risk.

This package provides React and React ecosystem integrations for Datadog Browser RUM.

## Installation

```bash
npm install @datadog/browser-rum @datadog/browser-rum-react
```

## Usage

### Initialization

To enable the React integration, pass the `reactPlugin` to the `betaPlugins` option of the `datadogRum.init` method:

```javascript
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'

datadogRum.init({
  applicationId: ...,
  clientToken: ...,
  ...
  betaPlugins: [reactPlugin()],
})
```

### Error Tracking

To track React component rendering errors, use one of the following:

- A basic `ErrorBoundary` component (see [React documentation](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)) that catches errors and reports them to Datadog.
- A function that you can use to report errors from your own `ErrorBoundary` component.

#### `ErrorBoundary` usage

```javascript
import { ErrorBoundary } from '@datadog/browser-rum-react'

function App() {
  return (
    <ErrorBoundary fallback={ErrorFallback}>
      <MyComponent />
    </ErrorBoundary>
  )
}

function ErrorFallback({ resetError, error }: { resetError: () => void; error: unknown }) {
  return (
    <p>
      Oops, something went wrong! <strong>{String(error)}</strong> <button onClick={resetError}>Retry</button>
    </p>
  )
}
```

#### Reporting React errors from your own `ErrorBoundary`

```javascript
import { addReactError } from '@datadog/browser-rum-react'

class MyErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    addReactError(error, errorInfo)
  }

  render() {
    ...
  }
}

```

### React Router integration

`react-router` v6 allows you to declare routes using the following methods:

- Create routers with [`createMemoryRouter`](https://reactrouter.com/en/main/routers/create-memory-router), [`createHashRouter`](https://reactrouter.com/en/main/routers/create-hash-router), and [`createBrowserRouter`](https://reactrouter.com/en/main/routers/create-browser-router) functions.
- Use the [`useRoutes`](https://reactrouter.com/en/main/hooks/use-routes) hook.
- Use the [`Routes`](https://reactrouter.com/en/main/components/routes) component.

To track route changes with the Datadog RUM Browser SDK, first initialize the `reactPlugin` with the `router: true` option, then replace those functions with the same functions from `@datadog/browser-rum-react/react-router-v6`. Example:

```javascript
import { RouterProvider } from 'react-router-dom'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'
// Use "createBrowserRouter" from @datadog/browser-rum-react/react-router-v6 instead of react-router-dom:
import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v6'

datadogRum.init({
  ...
  betaPlugins: [reactPlugin({ router: true })],
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    ...
  },
])

ReactDOM.createRoot(document.getElementById('root')).render(<RouterProvider router={router} />)
```
