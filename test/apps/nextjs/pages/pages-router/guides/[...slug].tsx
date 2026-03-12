// Catch-all route page for /pages-router/guides/[...slug]. Used to verify that concrete URLs
// (/guides/123) are normalised to /pages-router/guides/[...slug] in RUM view names.
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
      <p>This is a catch-all route testing slug normalization.</p>
    </div>
  )
}
