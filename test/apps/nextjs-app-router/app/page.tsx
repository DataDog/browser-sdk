import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Home</h1>
      <ul>
        <li>
          <Link href="/user/42">Go to User 42</Link>
        </li>
        <li>
          <Link href="/user/123">Go to User 123</Link>
        </li>
        <li>
          <Link href="/tracked">Go to Tracked Component</Link>
        </li>
        <li>
          <Link href="/error-test">Go to Error Test</Link>
        </li>
      </ul>
    </div>
  )
}
