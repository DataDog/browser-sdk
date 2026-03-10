export default async function GlobalErrorTestPage({ searchParams }: { searchParams: Promise<{ throw?: string }> }) {
  const { throw: shouldThrow } = await searchParams
  if (shouldThrow === 'true') throw new Error('Global error test')
  return <div>Global error test page</div>
}
