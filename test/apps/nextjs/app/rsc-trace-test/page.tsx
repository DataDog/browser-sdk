import Link from 'next/link'
import { Suspense } from 'react'
import WeatherWidget from './WeatherWidget'

export const dynamic = 'force-dynamic'

// --- Nested server components, each fetching their own data ---

async function UserProfile({ userId }: { userId: number }) {
  const res = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`, { cache: 'no-store' })
  const user = await res.json()

  return (
    <div style={{ padding: '1rem', background: '#e3f2fd', borderRadius: '8px', marginBottom: '1rem' }}>
      <h3>{user.name}</h3>
      <p>
        {user.email} &middot; {user.company?.name}
      </p>

      {/* Nested server component: fetch this user's posts */}
      <Suspense
        fallback={
          <div style={{ padding: '0.5rem', background: '#bbdefb', borderRadius: '4px' }}>Loading posts...</div>
        }
      >
        <UserPosts userId={userId} />
      </Suspense>
    </div>
  )
}

async function UserPosts({ userId }: { userId: number }) {
  const res = await fetch(`https://jsonplaceholder.typicode.com/posts?userId=${userId}&_limit=3`, {
    cache: 'no-store',
  })
  const posts = await res.json()

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <strong>Recent posts:</strong>
      <ul>
        {posts.map((post: { id: number; title: string }) => (
          <li key={post.id} style={{ fontSize: '0.9rem' }}>
            {post.title}
          </li>
        ))}
      </ul>

      {/* Nested server component: fetch comments for the first post */}
      <Suspense
        fallback={
          <div style={{ padding: '0.5rem', background: '#90caf9', borderRadius: '4px' }}>Loading comments...</div>
        }
      >
        <PostComments postId={posts[0]?.id} />
      </Suspense>
    </div>
  )
}

async function PostComments({ postId }: { postId: number }) {
  if (!postId) return null
  const res = await fetch(`https://jsonplaceholder.typicode.com/comments?postId=${postId}&_limit=2`, {
    cache: 'no-store',
  })
  const comments = await res.json()

  return (
    <div style={{ marginTop: '0.5rem', paddingLeft: '1rem', borderLeft: '2px solid #90caf9' }}>
      <strong>Comments on first post:</strong>
      {comments.map((c: { id: number; name: string; email: string }) => (
        <p key={c.id} style={{ fontSize: '0.85rem', margin: '0.25rem 0' }}>
          <em>{c.name}</em> &mdash; {c.email}
        </p>
      ))}
    </div>
  )
}

// --- Page component ---

export default async function RscTraceTestPage() {
  // Top-level fetch: get the list of users to display
  const res = await fetch('https://jsonplaceholder.typicode.com/users?_limit=2', { cache: 'no-store' })
  const users: { id: number; name: string }[] = await res.json()

  return (
    <div>
      <Link href="/">Home</Link>
      <h1>RSC Trace Test</h1>
      <p style={{ color: '#666' }}>
        This page has nested server components, each making their own fetch calls. The APM trace should show a hierarchy
        of spans: page &rarr; user profile &rarr; user posts &rarr; post comments, plus an independent weather widget.
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Users</h2>
        {users.map((user) => (
          <Suspense
            key={user.id}
            fallback={
              <div style={{ padding: '1rem', background: '#e0e0e0', borderRadius: '8px', marginBottom: '1rem' }}>
                Loading user {user.id}...
              </div>
            }
          >
            <UserProfile userId={user.id} />
          </Suspense>
        ))}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Independent Widget</h2>
        <Suspense
          fallback={
            <div style={{ padding: '1rem', background: '#ffe0b2', borderRadius: '8px' }}>Loading weather...</div>
          }
        >
          <WeatherWidget />
        </Suspense>
      </section>
    </div>
  )
}
