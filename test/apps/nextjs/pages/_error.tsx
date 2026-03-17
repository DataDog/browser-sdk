import { addNextjsError } from '@datadog/browser-rum-nextjs'
import { useEffect } from 'react'

function ErrorPage({ err }: { err?: Error & { statusCode?: number } }) {
  useEffect(() => {
    if (err) addNextjsError(err)
  }, [err])
  return (
    <div data-testid="pages-error-page">
      <h2>Something went wrong</h2>
    </div>
  )
}

ErrorPage.getInitialProps = ({ res, err }: { res?: { statusCode: number }; err?: Error }) => {
  const statusCode = res?.statusCode ?? (err as any)?.statusCode ?? 404
  return { statusCode, err }
}

export default ErrorPage