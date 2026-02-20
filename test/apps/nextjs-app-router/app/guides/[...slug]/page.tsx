import Link from 'next/link'

export default async function GuidesPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>Guides: {slug.join('/')}</h1>
      <p>This is a catch-all route testing slug normalization.</p>
    </div>
  )
}
