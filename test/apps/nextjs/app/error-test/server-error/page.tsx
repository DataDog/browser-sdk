// The ?throw=true guard is required because Next.js prerenders pages at build time.
// An unconditional throw would fail the production build.
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
