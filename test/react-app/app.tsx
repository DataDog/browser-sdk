import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v7'
import { RouterProvider, Link, useParams, Outlet } from 'react-router-dom'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin, UNSTABLE_ReactComponentTracker as ReactComponentTracker } from '@datadog/browser-rum-react'

declare global {
  interface Window {
    RUM_CONFIGURATION?: any
  }
}

datadogRum.init({ ...window.RUM_CONFIGURATION,plugins: [reactPlugin({ router: true } )] })

function HomePage() {
  return (
    <div>
      <h1>Home</h1>
      <Link to="/user/42">Go to User</Link>
      <br />
      <Link to="/tracked">Go to Tracked</Link>
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
          path: 'tracked',
          Component: TrackedPage,
        },
      ],
    },
  ],
)

const rootElement = document.createElement('div')
document.body.appendChild(rootElement)
const root = ReactDOM.createRoot(rootElement)
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
