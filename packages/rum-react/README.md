# RUM Browser Monitoring - React integration

This package provides React and React ecosystem integrations for Datadog Browser RUM.

## Installation

```bash
npm install @datadog/browser-rum @datadog/browser-rum-react
```

## Usage

### Initialization

To enable the React integration, pass the `reactPlugin` to the `plugins` option of the `datadogRum.init` method:

```javascript
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'

datadogRum.init({
  applicationId: ...,
  clientToken: ...,
  ...
  plugins: [reactPlugin()],
})
```

### Error Tracking

To track React component rendering errors, use one of the following:

- An `ErrorBoundary` component (see [React documentation][1]) that catches errors and reports them to Datadog.
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

- Create routers with [`createMemoryRouter`][2], [`createHashRouter`][3], or [`createBrowserRouter`][4] functions.
- Use the [`useRoutes`][5] hook.
- Use the [`Routes`][6] component.

To track route changes with the Datadog RUM Browser SDK, first initialize the `reactPlugin` with the `router: true` option, then replace those functions with their equivalent from `@datadog/browser-rum-react/react-router-v6`. Example:

```javascript
import { RouterProvider } from 'react-router-dom'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'
// Use "createBrowserRouter" from @datadog/browser-rum-react/react-router-v6 instead of react-router-dom:
import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v6'

datadogRum.init({
  ...
  plugins: [reactPlugin({ router: true })],
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

[1]: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
[2]: https://reactrouter.com/en/main/routers/create-memory-router
[3]: https://reactrouter.com/en/main/routers/create-hash-router
[4]: https://reactrouter.com/en/main/routers/create-browser-router
[5]: https://reactrouter.com/en/main/hooks/use-routes
[6]: https://reactrouter.com/en/main/components/routes
