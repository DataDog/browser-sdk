import Link from 'next/link'
import { useRouter } from 'next/router'

export default function UserPage() {
  const router = useRouter()
  const { id } = router.query

  return (
    <div>
      <Link href="/pages-router">← Back to Home</Link>
      <h1>User {id}</h1>
      <p>This is a dynamic route testing view name normalization.</p>
      <Link href="/pages-router/user/999?admin=true">Go to User 999</Link>
      <Link href={`/pages-router/user/${id}?admin=false`}>Change query params</Link>
    </div>
  )
}
