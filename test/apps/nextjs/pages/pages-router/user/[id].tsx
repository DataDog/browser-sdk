// Dynamic route page for /pages-router/user/[id]. Used to verify that concrete URLs
// (/user/42, /user/999) are normalised to /pages-router/user/[id] in RUM view names.
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
      <div>
        <Link href="/pages-router/user/999?admin=true">Go to User 999</Link>
      </div>
      <div>
        <Link href={`/pages-router/user/${id}?admin=false`}>Change query params</Link>
      </div>
    </div>
  )
}
