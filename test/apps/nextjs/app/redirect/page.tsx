import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function redirectPage() {
  redirect('/user/123')

  return (
    <div>
      <Link href="/">Back to Home</Link>
      <h1>Slow Page</h1>
    </div>
  )
}
