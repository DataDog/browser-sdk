// Home page — initial landing page for all pages router tests. Contains navigation links to
// every other test route so tests can reach them via page.click().
import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Home</h1>
      <ul>
        <li>
          <Link href="/pages-router/user/42?admin=true">Go to User 42</Link>
        </li>
        <li>
          <Link href="/pages-router/guides/123">Go to Guides 123</Link>
        </li>
        <li>
          <Link href="/pages-router/error-test">Go to Error Test</Link>
        </li>
        <li>
          <Link href="/">Go to App Router</Link>
        </li>
      </ul>
    </div>
  )
}
