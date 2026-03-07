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
          <Link href="/guides/getting-started/intro">Go to Guides</Link>
        </li>
      </ul>
    </div>
  )
}
