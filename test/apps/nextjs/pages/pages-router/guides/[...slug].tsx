import Link from 'next/link'
import { useRouter } from 'next/router'

export default function GuidesPage() {
  const router = useRouter()
  const { slug } = router.query
  const slugParts = Array.isArray(slug) ? slug : slug ? [slug] : []

  return (
    <div>
      <Link href="/pages-router">← Back to Home</Link>
      <h1>Guides: {slugParts.join('/')}</h1>
    </div>
  )
}
