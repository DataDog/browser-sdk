import Link from 'next/link'
import { useRouter } from 'next/router'

export default function UserPage() {
  const router = useRouter()
  const { id } = router.query

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>User {id}</h1>
      <p>This is a dynamic route testing view name normalization.</p>
    </div>
  )
}
