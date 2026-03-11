// Server component that throws when ?throw=true is present. Used to verify that server errors
// are caught by the parent error.tsx with a digest attached to the error context.
// The ?throw=true guard prevents Next.js from failing the build during static prerendering.
export default async function ServerErrorPage({ searchParams }: { searchParams: Promise<{ throw?: string }> }) {
  const { throw: shouldThrow } = await searchParams

  if (shouldThrow === 'true') {
    throw new Error('Server error from error-test')
  }

  return (
    <div>
      <h1>Server Error Test</h1>
    </div>
  )
}
