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
      </ul>
    </div>
  )
}
