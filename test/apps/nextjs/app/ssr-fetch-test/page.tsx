export const dynamic = 'force-dynamic'

export default async function SsrFetchTestPage() {
  const start = Date.now()

  const [fastResponse, slowResponse] = await Promise.all([
    fetch('https://httpbin.org/json', { cache: 'no-store' }),
    fetch('https://httpbin.org/delay/1', { cache: 'no-store' }),
  ])

  const fastData = await fastResponse.json()
  const slowData = await slowResponse.json()
  const elapsed = Date.now() - start

  return (
    <div>
      <h1>SSR Data Fetching Test</h1>
      <p>
        This page fetches from two external APIs during server-side rendering. The trace should show child spans for
        each outgoing fetch under the page render span.
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Fast fetch (httpbin.org/json)</h2>
        <pre style={{ background: '#f5f5f5', padding: '1rem', overflow: 'auto', maxHeight: '200px' }}>
          {JSON.stringify(fastData, null, 2)}
        </pre>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Slow fetch (httpbin.org/delay/1)</h2>
        <p>
          Response took <strong>{slowData.headers?.['X-Request-Id'] ? 'OK' : 'OK'}</strong> — server saw a ~1s delay.
        </p>
        <pre style={{ background: '#f5f5f5', padding: '1rem', overflow: 'auto', maxHeight: '200px' }}>
          {JSON.stringify(slowData, null, 2)}
        </pre>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Server timing</h2>
        <p>
          Both fetches ran in parallel. Total server render time: <strong>{elapsed}ms</strong>
        </p>
        <p>
          Rendered at: <code>{new Date().toISOString()}</code>
        </p>
      </section>
    </div>
  )
}
