// Server component that throws at root level when ?throw=true, triggering global-error.tsx.
// Needed because global-error.tsx only activates for errors that escape the root layout.
export default async function GlobalErrorTestPage({ searchParams }: { searchParams: Promise<{ throw?: string }> }) {
  const { throw: shouldThrow } = await searchParams
  if (shouldThrow === 'true') throw new Error('Global error test')
  return <div>Global error test page</div>
}
