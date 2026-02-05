'use client'

import Link from 'next/link'
import { UNSTABLE_ReactComponentTracker as ReactComponentTracker } from '@datadog/browser-rum-react'

export default function TrackedPage() {
  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <ReactComponentTracker name="TrackedPage">
        <h1>Component Tracker</h1>
        <p>This component is tracked for performance metrics.</p>
      </ReactComponentTracker>
    </div>
  )
}
