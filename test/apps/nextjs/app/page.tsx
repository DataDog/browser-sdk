// Home page — initial landing page for all app router tests. Contains navigation links to
// every other test route so tests can reach them via page.click().
import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Home</h1>
      <ul>
        <li>
          <Link href="/user/42?admin=true">Go to User 42</Link>
        </li>
        <li>
          <Link href="/guides/123">Go to Guides 123</Link>
        </li>
        <li>
          <Link href="/error-test">Go to Error Test</Link>
        </li>
        <li>
          <Link href="/error-test/server-error?throw=true">Go to Server Error</Link>
        </li>
        <li>
          <Link href="/global-error-test?throw=true">Go to Global Error</Link>
        </li>
        <li>
          <Link href="/pages-router">Go to Pages Router</Link>
        </li>
      </ul>
    </div>
  )
}
