import Link from 'next/link'
import { ClientErrorThrower } from './clientErrorThrower'

export default function ErrorTestPage() {
  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>Error Test</h1>
      <ClientErrorThrower />
    </div>
  )
}
