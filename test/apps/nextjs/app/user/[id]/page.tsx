import Link from 'next/link'

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <div>
      <Link data-testid="back-to-home" href="/">
        ← Back to Home
      </Link>
      <h1>User {id}</h1>
      <div>
        <Link data-testid="go-to-other-user" href="/user/999?admin=true">
          Go to User 999
        </Link>
      </div>
      <div>
        <Link data-testid="change-query-params" href={`/user/${id}?admin=false`}>
          Change query params
        </Link>
      </div>
      <div>
        <Link data-testid="go-to-section" href={`/user/${id}#section`}>
          Go to Section
        </Link>
      </div>
    </div>
  )
}
