// Error test page. Renders ClientErrorThrower so the test can trigger a client-side error
// and verify it is captured by error.tsx via addNextjsError.
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
