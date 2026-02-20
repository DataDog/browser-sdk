import Link from 'next/link'

export default function ErrorTestPage() {
  const throwAsyncError = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    throw new Error('Test asynchronous error')
  }

  const throwUnhandledRejection = () => {
    Promise.reject(new Error('Test unhandled promise rejection'))
  }

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>Error Testing</h1>

      <section>
        <h3>Error Types</h3>
        <button onClick={() => throwAsyncError()}>Async Error</button>
        <button onClick={throwUnhandledRejection}>Unhandled Rejection</button>
      </section>
    </div>
  )
}
