import Link from 'next/link'
import { Suspense } from 'react'

async function SlowComponent({ delay, label }: { delay: number; label: string }) {
  await new Promise((resolve) => setTimeout(resolve, delay))
  return (
    <div style={{ padding: '1rem', background: '#f0f0f0', borderRadius: '8px', marginBottom: '1rem' }}>
      <strong>{label}</strong> loaded after {delay}ms
      <br />
      <small style={{ color: '#666' }}>Server time: {new Date().toISOString()}</small>
    </div>
  )
}

export default function StreamingTestPage() {
  return (
    <div>
      <Link href="/">Home</Link>
      <h1>Streaming Test</h1>
      <p style={{ color: '#666' }}>
        This page uses React Suspense to stream content progressively.
        Check <code>view.loading_time</code> in RUM — it captures when streaming completes.
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Shell (immediate)</h2>
        <p>This content is part of the shell and renders immediately.</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Streamed Content</h2>

        <Suspense fallback={<div style={{ padding: '1rem', background: '#ffe0b2', borderRadius: '8px', marginBottom: '1rem' }}>Loading fast component...</div>}>
          <SlowComponent delay={500} label="Fast component" />
        </Suspense>

        <Suspense fallback={<div style={{ padding: '1rem', background: '#ffe0b2', borderRadius: '8px', marginBottom: '1rem' }}>Loading medium component...</div>}>
          <SlowComponent delay={1500} label="Medium component" />
        </Suspense>

        <Suspense fallback={<div style={{ padding: '1rem', background: '#ffe0b2', borderRadius: '8px', marginBottom: '1rem' }}>Loading slow component...</div>}>
          <SlowComponent delay={3000} label="Slow component" />
        </Suspense>
      </section>
    </div>
  )
}
