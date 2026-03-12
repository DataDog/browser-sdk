// Custom error page rendered by Next.js for unhandled server errors (4xx/5xx).
// Not exercised by E2E tests — present so Next.js has a fallback instead of its default page.
function ErrorPage({ statusCode }: { statusCode?: number }) {
  return (
    <div>
      <h2>{statusCode ? `An error ${statusCode} occurred on server` : 'An error occurred on client'}</h2>
    </div>
  )
}

ErrorPage.getInitialProps = ({ res, err }: { res?: { statusCode: number }; err?: Error }) => {
  const statusCode = res?.statusCode ?? (err as any)?.statusCode ?? 404
  return { statusCode }
}

export default ErrorPage
