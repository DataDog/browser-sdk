import Link from 'next/link'
import { useRouter } from 'next/router'

export default function GuidesPage() {
  const { slug } = useRouter().query

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>Guides: {Array.isArray(slug) ? slug.join('/') : slug}</h1>
      <p>This is a catch-all route testing slug normalization.</p>
    </div>
  )
}
