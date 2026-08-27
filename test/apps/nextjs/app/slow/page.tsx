import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SlowPage() {
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return (
    <div>
      <Link href="/">Back to Home</Link>
      <h1>Slow Page</h1>
    </div>
  )
}
