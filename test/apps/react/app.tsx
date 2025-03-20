import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v7'
import { RouterProvider, Link, useParams, Outlet } from 'react-router-dom'
import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { datadogRum } from '@datadog/browser-rum'
import {
  reactPlugin,
  UNSTABLE_ReactComponentTracker as ReactComponentTracker,
  ErrorBoundary,
} from '@datadog/browser-rum-react'

declare global {
  interface Window {
    RUM_CONFIGURATION?: any
    RUM_CONTEXT?: any
  }
}

datadogRum.init({ ...window.RUM_CONFIGURATION, plugins: [reactPlugin({ router: true })] })
if (window.RUM_CONTEXT) {
  datadogRum.setGlobalContext(window.RUM_CONTEXT)
}

function HomePage() {
  return (
    <div>
      <h1>Home</h1>
      <Link to="/user/42">Go to User</Link>
      <br />
      <Link to="/tracked">Go to Tracked</Link>
      <br />
      <Link to="/error">Go to Error Component</Link>
    </div>
  )
}

function UserPage() {
  const { id } = useParams()
  return (
    <div>
      <h1>User {id}</h1>
    </div>
  )
}

function Layout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/user/42">Go to User</Link>
      </nav>
      <Outlet />
    </div>
  )
}

function TrackedPage() {
  return (
    <ReactComponentTracker name="TrackedPage">
      <h1>Component Tracker</h1>
    </ReactComponentTracker>
  )
}

function ComponentWithErrorButton() {
  const [shouldError, setShouldError] = useState(false)

  if (shouldError) {
    throw new Error('Error triggered by button click')
  }

  return (
    <div>
      <h1>Component with Error Button</h1>
      <button id="error-button" onClick={() => setShouldError(true)}>
        Trigger Error
      </button>
    </div>
  )
}

function ErrorPage() {
  return (
    <div>
      <h1>Error Page</h1>
      <ErrorBoundary
        fallback={({ error, resetError }) => (
          <div>
            <h2>Something went wrong</h2>
            <p>{error.message}</p>
            <button onClick={resetError}>Try again</button>
          </div>
        )}
      >
        <ComponentWithErrorButton />
      </ErrorBoundary>
    </div>
  )
}

const router = createBrowserRouter([
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
        path: 'tracked',
        Component: TrackedPage,
      },
      {
        path: 'error',
        Component: ErrorPage,
      },
    ],
  },
])

const rootElement = document.createElement('div')
document.body.appendChild(rootElement)
const root = ReactDOM.createRoot(rootElement)
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
