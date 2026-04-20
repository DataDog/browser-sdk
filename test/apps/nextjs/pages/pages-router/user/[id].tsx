import Link from 'next/link'
import { useRouter } from 'next/router'

export default function UserPage() {
  const router = useRouter()
  const { id } = router.query

  return (
    <div>
      <Link data-testid="back-to-home" href="/pages-router">
        ← Back to Home
      </Link>
      <h1>User {id}</h1>
      <div>
        <Link data-testid="go-to-other-user" href="/pages-router/user/999?admin=true">
          Go to User 999
        </Link>
      </div>
      <div>
        <Link data-testid="change-query-params" href={`/pages-router/user/${id}?admin=false`}>
          Change query params
        </Link>
      </div>
      <div>
        <Link data-testid="go-to-section" href={`/pages-router/user/${id}#section`}>
          Go to Section
        </Link>
      </div>
    </div>
  )
}
