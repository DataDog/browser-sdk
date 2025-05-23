import { DatadogProvider, offlineClientInit } from '@datadog/browser-flagging'
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
})

const subject = {
  key: 'subject-key-1',
}

const precomputedConfiguration =
  '{"version":1,"precomputed":{"subjectKey":"test-subject-key","subjectAttributes":{"categoricalAttributes":{"platform":"ios","language":"en-US","hasPushEnabled":false,"buildNumber":42},"numericAttributes":{"lastLoginDays":3,"lifetimeValue":543.21}},"fetchedAt":"2024-11-18T14:23:39.456Z","response":"{\\"createdAt\\":\\"2024-11-18T14:23:25.123Z\\",\\"format\\":\\"PRECOMPUTED\\",\\"salt\\":\\"c29kaXVtY2hsb3JpZGU=\\",\\"obfuscated\\":false,\\"environment\\":{\\"name\\":\\"Test\\"},\\"flags\\":{\\"string-flag\\":{\\"allocationKey\\":\\"allocation-123\\",\\"variationKey\\":\\"variation-123\\",\\"variationType\\":\\"STRING\\",\\"variationValue\\":\\"red\\",\\"extraLogging\\":{},\\"doLog\\":true},\\"boolean-flag\\":{\\"allocationKey\\":\\"allocation-124\\",\\"variationKey\\":\\"variation-124\\",\\"variationType\\":\\"BOOLEAN\\",\\"variationValue\\":true,\\"extraLogging\\":{},\\"doLog\\":true},\\"integer-flag\\":{\\"allocationKey\\":\\"allocation-125\\",\\"variationKey\\":\\"variation-125\\",\\"variationType\\":\\"INTEGER\\",\\"variationValue\\":42,\\"extraLogging\\":{},\\"doLog\\":true},\\"numeric-flag\\":{\\"allocationKey\\":\\"allocation-126\\",\\"variationKey\\":\\"variation-126\\",\\"variationType\\":\\"NUMERIC\\",\\"variationValue\\":3.14,\\"extraLogging\\":{},\\"doLog\\":true},\\"json-flag\\":{\\"allocationKey\\":\\"allocation-127\\",\\"variationKey\\":\\"variation-127\\",\\"variationType\\":\\"JSON\\",\\"variationValue\\":\\"{\\\\\\"key\\\\\\":\\\\\\"value\\\\\\",\\\\\\"number\\\\\\":123}\\",\\"extraLogging\\":{},\\"doLog\\":true},\\"string-flag-with-extra-logging\\":{\\"allocationKey\\":\\"allocation-128\\",\\"variationKey\\":\\"variation-128\\",\\"variationType\\":\\"STRING\\",\\"variationValue\\":\\"red\\",\\"extraLogging\\":{\\"holdoutKey\\":\\"activeHoldout\\",\\"holdoutVariation\\":\\"all_shipped\\"},\\"doLog\\":true},\\"not-a-bandit-flag\\":{\\"allocationKey\\":\\"allocation-129\\",\\"variationKey\\":\\"variation-129\\",\\"variationType\\":\\"STRING\\",\\"variationValue\\":\\"control\\",\\"extraLogging\\":{},\\"doLog\\":true}},\\"bandits\\":{\\"string-flag\\":{\\"banditKey\\":\\"recommendation-model-v1\\",\\"action\\":\\"show_red_button\\",\\"actionProbability\\":0.85,\\"optimalityGap\\":0.12,\\"modelVersion\\":\\"v2.3.1\\",\\"actionNumericAttributes\\":{\\"expectedConversion\\":0.23,\\"expectedRevenue\\":15.75},\\"actionCategoricalAttributes\\":{\\"category\\":\\"promotion\\",\\"placement\\":\\"home_screen\\"}},\\"string-flag-with-extra-logging\\":{\\"banditKey\\":\\"content-recommendation\\",\\"action\\":\\"featured_content\\",\\"actionProbability\\":0.72,\\"optimalityGap\\":0.08,\\"modelVersion\\":\\"v1.5.0\\",\\"actionNumericAttributes\\":{\\"expectedEngagement\\":0.45,\\"timeOnPage\\":120.5},\\"actionCategoricalAttributes\\":{\\"contentType\\":\\"article\\",\\"theme\\":\\"dark\\"}}}}"}}'

async function initializeOpenFeature(precomputedConfiguration: string) {
  const precomputeClient = offlineClientInit({
    precomputedConfiguration,
    throwOnFailedInitialization: false,
  })
  const datadogFlaggingProvider = new DatadogProvider(precomputeClient)
  await OpenFeature.setContext(subject)

  try {
    await OpenFeature.setProviderAndWait(datadogFlaggingProvider)
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
  const [flagValue, setFlagValue] = useState<boolean | null>(null)

  useEffect(() => {
    initializeOpenFeature(precomputedConfiguration).then(() => {
      const client = OpenFeature.getClient()
      const flagEval = client.getBooleanValue('boolean-flag', false)
      setFlagValue(flagEval)
    })
  }, [])

  return (
    <div>
      <h1>Home</h1>
      <h2>Flagging Evaluation</h2>
      <ul>
        <li>
          Subject Key: <i>{subject.key}</i>
        </li>
        <li>
          Flag Key: <i>boolean-flag</i>
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
