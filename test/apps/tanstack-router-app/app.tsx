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
        <Link to="/posts/$postId" params={{ postId: '42' }}>
          Post 42
        </Link>
        {' | '}
        <Link to="/" search={{ tab: 'settings' } as Record<string, string>}>
          Query Param
        </Link>
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
  component: () => <h1>Home</h1>,
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

function PostDetail() {
  const { postId } = useParams({ strict: false })
  return <h1>Post {postId}</h1>
}

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/$postId',
  component: PostDetail,
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
  postsRoute.addChildren([postsIndexRoute, postRoute]),
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
