import Link from 'next/link'

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>User {id}</h1>
      <p>This is a dynamic route testing view name normalization.</p>
    </div>
  )
}
