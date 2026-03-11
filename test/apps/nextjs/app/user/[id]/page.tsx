// Dynamic route page for /user/[id]. Used to verify that concrete URLs (/user/42, /user/999)
// are normalised to the pattern /user/[id] in RUM view names.
import Link from 'next/link'

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>User {id}</h1>
      <p>This is a dynamic route testing view name normalization.</p>
      <div>
        <Link href="/user/999?admin=true">Go to User 999</Link>
      </div>
      <div>
        <Link href={`/user/${id}?admin=false`}>Change query params</Link>
      </div>
    </div>
  )
}
