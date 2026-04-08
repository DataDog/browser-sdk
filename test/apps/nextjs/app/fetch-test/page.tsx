'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function FetchTestPage() {
  const [getResult, setGetResult] = useState<string>('')
  const [postResult, setPostResult] = useState<string>('')

  const handleGet = async () => {
    const res = await fetch('/api/test')
    const data = await res.json()
    setGetResult(JSON.stringify(data, null, 2))
  }

  const handlePost = async () => {
    const res = await fetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello from client', timestamp: Date.now() }),
    })
    const data = await res.json()
    setPostResult(JSON.stringify(data, null, 2))
  }

  return (
    <div>
      <Link href="/">Home</Link>
      <h1>Fetch / API Route Test</h1>
      <p style={{ color: '#666' }}>
        These fetch calls go to <code>/api/test</code> which is wrapped with <code>withDatadogApiRoute</code>.
        With <code>allowedTracingUrls</code> configured, RUM injects trace headers into each request.
      </p>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>GET /api/test</h2>
        <button onClick={handleGet} data-testid="fetch-get">Send GET</button>
        {getResult && <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>{getResult}</pre>}
      </section>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>POST /api/test</h2>
        <button onClick={handlePost} data-testid="fetch-post">Send POST</button>
        {postResult && <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>{postResult}</pre>}
      </section>
    </div>
  )
}
