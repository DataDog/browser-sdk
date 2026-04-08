import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Datadog RUM Next.js Test App</h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2>View Tracking (App Router)</h2>
        <ul>
          <li>
            <Link href="/user/42?admin=true">Dynamic route: /user/42</Link>
          </li>
          <li>
            <Link href="/guides/123">Catch-all route: /guides/123</Link>
          </li>
          <li>
            <Link href="/guides/a/b/c">Deep catch-all: /guides/a/b/c</Link>
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Server Actions</h2>
        <ul>
          <li>
            <Link href="/actions-test">Server Actions test (withServerAction wrapper)</Link>
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Streaming (Suspense)</h2>
        <ul>
          <li>
            <Link href="/streaming-test">Streaming test (shell + progressive loading)</Link>
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>SSR Data Fetching</h2>
        <ul>
          <li>
            <Link href="/ssr-fetch-test">SSR fetch test (parallel external API calls during render)</Link>
          </li>
          <li>
            <Link href="/rsc-trace-test">RSC trace test (nested server components with cascading fetches)</Link>
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Fetch / API Routes</h2>
        <ul>
          <li>
            <Link href="/fetch-test">Fetch test (GET/POST to /api/test with trace correlation)</Link>
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Error Handling</h2>
        <ul>
          <li>
            <Link href="/error-test">Client error (error boundary + addNextjsError)</Link>
          </li>
          <li>
            <Link href="/error-test/server-error?throw=true">Server error (digest)</Link>
          </li>
          <li>
            <Link href="/global-error-test?throw=true">Global error (global-error.tsx)</Link>
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Pages Router</h2>
        <ul>
          <li>
            <a href="/pages-router">Pages Router home (full page navigation)</a>
          </li>
          <li>
            <a href="/pages-router/user/42">Pages Router dynamic route</a>
          </li>
        </ul>
      </section>
    </div>
  )
}
