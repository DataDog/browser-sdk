import { Link, Outlet, RouterProvider, useParams , useSearchParams} from 'react-router-dom'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { datadogRum } from '@datadog/browser-rum'
import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v7'
import { reactPlugin, ErrorBoundary, UNSTABLE_ReactComponentTracker } from '@datadog/browser-rum-react'
import { datadogFlagging } from '@datadog/browser-flagging'
import { dateNow } from '@datadog/browser-core'

const urlParams = new URLSearchParams(window.location.search);
const appId = urlParams.get('appId') ?? 'APPID';
const clientToken = urlParams.get('clientToken') ?? "clientToken";

datadogRum.init({
  applicationId: appId,
  clientToken: clientToken,
  plugins: [reactPlugin({ router: true })],
})

// Pass the APP ID and SDK Token
datadogFlagging.init({appId, clientToken: clientToken});

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
          path: 'flagging',
          Component: FlaggingPage,
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

  const [appId, setAppId] = useState('<APP ID>');
  const [clientToken, setclientToken] = useState('<SDK Token>');

  return (<>
    <h1>Home</h1>
    <input type="text" title="APP ID" onChange={ e => setAppId(e.target.value)} defaultValue="<application ID>"></input>
    <input type="text" title="Client Token"  onChange={ e => setclientToken(e.target.value)} defaultValue="<client token>"></input>
    <Link reloadDocument to={`/flagging?appId=${appId}&clientToken=${clientToken}`}>Flagging Sandbox</Link>
  </>)
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

function FlaggingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const appId = searchParams.get('appId');
  const clientToken = searchParams.get('clientToken');

  const triggerExposure = () => {
    datadogRum.addAction('__datadog_exposure', {
      'timestamp': dateNow(),
      'flag_key': 'my-first-flag',
      'allocation_key': 'allocation1',
      'exposure_key': 'my-first-flag-allocation1',
      'subject_key': 'everyPaidPerson',
      'subject_attributes': {},
      'variant_key': 'premium-variant',
      'metadata': {},
    });
  }

  return (
    <UNSTABLE_ReactComponentTracker name="UserPage">
      <h1>App ID</h1>
        <pre>{appId}</pre>
      <h1>SDK Key</h1>
      <pre>{clientToken}</pre>

      <div>
        <button onClick={triggerExposure}>Trigger Exposure</button>
      </div>
    </UNSTABLE_ReactComponentTracker>
  );
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
