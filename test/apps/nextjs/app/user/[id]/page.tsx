import Link from 'next/link'

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>User {id}</h1>
      <div>
        <Link href="/user/999?admin=true">Go to User 999</Link>
      </div>
      <div>
        <Link href={`/user/${id}?admin=false`}>Change query params</Link>
      </div>
      <div>
        <Link href={`/user/${id}#section`}>Go to Section</Link>
      </div>
    </div>
  )
}
