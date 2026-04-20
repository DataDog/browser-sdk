import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Home</h1>
      <ul>
        <li>
          <Link data-testid="go-to-user" href="/pages-router/user/42?admin=true">
            Go to User 42
          </Link>
        </li>
        <li>
          <Link data-testid="go-to-guides" href="/pages-router/guides/123">
            Go to Guides 123
          </Link>
        </li>
        <li>
          <Link data-testid="go-to-error-test" href="/pages-router/error-test">
            Go to Error Test
          </Link>
        </li>
      </ul>
    </div>
  )
}
