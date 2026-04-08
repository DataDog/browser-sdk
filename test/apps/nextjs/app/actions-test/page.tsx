'use client'

import { useState } from 'react'
import Link from 'next/link'
import { greetAction, slowAction, failingAction } from '../actions'

export default function ActionsTestPage() {
  const [greetResult, setGreetResult] = useState<string>('')
  const [slowResult, setSlowResult] = useState<string>('')
  const [errorResult, setErrorResult] = useState<string>('')

  const handleGreet = async (formData: FormData) => {
    const result = await greetAction(formData)
    setGreetResult(result)
  }

  const handleSlow = async () => {
    setSlowResult('Running...')
    const result = await slowAction()
    setSlowResult(result)
  }

  const handleFailing = async () => {
    try {
      await failingAction()
    } catch (e) {
      setErrorResult(`Caught error: ${(e as Error).message}`)
    }
  }

  return (
    <div>
      <Link href="/">Home</Link>
      <h1>Server Actions Test</h1>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Greet Action (with form)</h2>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          Action name resolved automatically from the server-reference manifest.
        </p>
        <form action={handleGreet}>
          <input name="name" placeholder="Enter your name" style={{ padding: '0.5rem', marginRight: '0.5rem' }} />
          <button type="submit" data-testid="greet-action">Submit</button>
        </form>
        {greetResult && <p data-testid="greet-result" style={{ color: 'green' }}>{greetResult}</p>}
      </section>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Slow Action (1s delay)</h2>
        <button onClick={handleSlow} data-testid="slow-action">Run Slow Action</button>
        {slowResult && <p data-testid="slow-result" style={{ color: 'blue' }}>{slowResult}</p>}
      </section>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Failing Action</h2>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>Throws on server</p>
        <button onClick={handleFailing} data-testid="failing-action">Run Failing Action</button>
        {errorResult && <p data-testid="error-result" style={{ color: 'red' }}>{errorResult}</p>}
      </section>
    </div>
  )
}
