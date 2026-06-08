import ReactDOM from 'react-dom/client'
import { RouterProvider, Link, Outlet, useParams, createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'
import { createRouter } from '@datadog/browser-rum-react/tanstack-router'

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

// Routes

const rootRoute = createRootRoute({
  component: () => (
    <div>
      <nav>
        <Link to="/">Home</Link>
        {' | '}
        <Link to="/posts">Posts</Link>
        {' | '}
        <Link to="/files/$" params={{ _splat: 'path/to/file' }}>
          Splat
        </Link>
        {' | '}
        <Link to="/old-posts">Redirect</Link>
      </nav>
      <hr />
      <Outlet />
    </div>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div>
      <h1>Home</h1>
      <Link to="/user/$id" params={{ id: '42' }} search={{ admin: true }}>
        Go to User 42
      </Link>
      <br />
      <Link to="/guides/$slug" params={{ slug: '123' }}>
        Go to Guides 123
      </Link>
    </div>
  ),
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts',
  component: () => (
    <div>
      <h1>Posts</h1>
      <Outlet />
    </div>
  ),
})

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => <p>Select a post</p>,
})

const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user/$id',
  component: () => {
    const { id } = useParams({ strict: false })
    return (
      <div>
        <h1>User {id}</h1>
        <Link to="/">Back to Home</Link>
        <br />
        <Link to="/user/$id" params={{ id: id! }} search={{ admin: false }}>
          Change query params
        </Link>
        <br />
        <Link to="/user/$id" params={{ id: '999' }} search={{ admin: true }}>
          Go to User 999
        </Link>
      </div>
    )
  },
})

const guidesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/guides/$slug',
  component: () => (
    <div>
      <h1>Guides</h1>
      <Link to="/">Back to Home</Link>
    </div>
  ),
})

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/files/$',
  component: () => {
    const { _splat } = useParams({ strict: false })
    return <h1>File: {_splat}</h1>
  },
})

const oldPostsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/old-posts',
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: '/posts' })
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute]),
  userRoute,
  guidesRoute,
  filesRoute,
  oldPostsRoute,
])

// Cast needed because local .tgz packaging creates separate type declarations.
// End users installing from npm won't need this — same pattern as react-router-v6-app.
const router = createRouter({ routeTree } as any)

const rootElement = document.createElement('div')
document.body.appendChild(rootElement)
const root = ReactDOM.createRoot(rootElement)
root.render(<RouterProvider router={router as any} />)
