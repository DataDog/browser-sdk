import type { NextPageContext } from 'next'
import { reportNextjsError } from '@datadog/browser-rum-nextjs/pages-router'

interface ErrorPageProps {
  statusCode?: number
  message?: string
}

function ErrorPage({ statusCode, message }: ErrorPageProps) {
  return (
    <div>
      <h1>{statusCode || 'Error'}</h1>
      <p>
        {message || (statusCode ? `A ${statusCode} error occurred on the server` : 'An error occurred on the client')}
      </p>
    </div>
  )
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404

  if (err) {
    reportNextjsError(err, statusCode ?? 500)
  }

  return { statusCode, message: err?.message }
}

export default ErrorPage
