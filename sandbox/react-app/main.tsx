import { DatadogProvider } from '@datadog/browser-flagging'
import { datadogRum } from '@datadog/browser-rum'
import { ErrorBoundary, reactPlugin, UNSTABLE_ReactComponentTracker } from '@datadog/browser-rum-react'
import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v7'
import { OpenFeature } from '@openfeature/web-sdk'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Link, Outlet, RouterProvider, useParams } from 'react-router-dom'

datadogRum.init({
  applicationId: 'xxx',
  clientToken: 'xxx',
  plugins: [reactPlugin({ router: true })],
  enableExperimentalFeatures: ['feature_flags'],
})

const subject = {
  targetingKey: 'subject-key-1',
}

async function initializeOpenFeature() {
  const datadogFlaggingProvider = new DatadogProvider({
    applicationId: 'xxx',
    clientToken: 'xxx',
    baseUrl: 'http://localhost:8000',
  })
  await OpenFeature.setContext(subject)

  OpenFeature.addHooks({
    after(_hookContext, details) {
      datadogRum.addFeatureFlagEvaluation(details.flagKey, details.value)
    },
  })

  try {
    await OpenFeature.setProviderAndWait(datadogFlaggingProvider)
    console.log('Successfully initialized Datadog provider')
  } catch (error) {
    console.error('Failed to initialize Datadog provider:', error)
  }
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
  const flagKey = 'boolean-flag'
  const [flagValue, setFlagValue] = useState<boolean | null>(null)

  useEffect(() => {
    initializeOpenFeature().finally(() => {
      const client = OpenFeature.getClient()
      const flagEval = client.getBooleanValue(flagKey, false)
      setFlagValue(flagEval)
    })
  }, [])

  return (
    <div>
      <h1>Home</h1>
      <h2>Flagging Evaluation</h2>
      <ul>
        <li>
          Subject Key: <i>{subject.targetingKey}</i>
        </li>
        <li>
          Flag Key: <i>{flagKey}</i>
        </li>
        <li>
          Variant: <i>{flagValue === null ? 'Loading...' : String(flagValue)}</i>
        </li>
      </ul>
    </div>
  )
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
