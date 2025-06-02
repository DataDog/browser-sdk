import { Link, Outlet, RouterProvider, useParams } from 'react-router-dom'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { datadogRum } from '@datadog/browser-rum'
import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v7'
import { reactPlugin, ErrorBoundary, UNSTABLE_ReactComponentTracker } from '@datadog/browser-rum-react'
import { datadogFlagging } from '@datadog/browser-flagging'

datadogRum.init({
  applicationId: 'xxx',
  clientToken: 'xxx',
  plugins: [reactPlugin({ router: true })],
})

datadogFlagging.init()

const router = createBrowserRouter(
  [
    {
      path: '/',
      Component: Layout,
      children: [
        {
          index: true,
          Component: HomePage,
        },
        {
          path: 'user/:id',
          Component: UserPage,
        },
        {
          path: 'test-error-boundary',
          Component: TestErrorBoundaryPage,
        },
        {
          path: '*',
          Component: WildCardPage,
        },
      ],
    },
  ],
  { basename: '/react-app/' }
)

const rootElement = document.createElement('div')
document.body.appendChild(rootElement)
const root = ReactDOM.createRoot(rootElement)
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)

function Layout() {
  return (
    <>
      <nav>
        <Link to="/">Home</Link> | <Link to="/user/42">Route with variable</Link> |{' '}
        <Link to="/test-error-boundary">Test error boundary</Link>
      </nav>
      <Outlet />
    </>
  )
}

function HomePage() {
  return <h1>Home</h1>
}

function UserPage() {
  const { id } = useParams()
  return (
    <UNSTABLE_ReactComponentTracker name="UserPage">
      <h1>User {id}</h1>
    </UNSTABLE_ReactComponentTracker>
  )
}

function WildCardPage() {
  const path = useParams()['*']
  return <h1>Wildcard: {path}</h1>
}

export function TestErrorBoundaryPage() {
  const [shouldThrow, setShouldThrow] = useState(false)

  // Reset the state so we throw only once
  useEffect(() => {
    setShouldThrow(false)
  }, [shouldThrow])

  return (
    <>
      <h1>Test error boundary</h1>
      <ErrorBoundary fallback={ErrorFallback}>
        <p>
          <button onClick={() => setShouldThrow(true)}>Throw</button>
        </p>
        {shouldThrow && <ThrowWhenRendered />}
      </ErrorBoundary>
    </>
  )
}

function ThrowWhenRendered(): undefined {
  throw new Error('Test error')
}

function ErrorFallback({ resetError, error }: { resetError: () => void; error: unknown }) {
  return (
    <p>
      Oops, something went wrong! <strong>{String(error)}</strong> <button onClick={resetError}>Reset</button>
    </p>
  )
}
