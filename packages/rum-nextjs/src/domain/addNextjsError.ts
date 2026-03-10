import { getGlobalPublicApi } from './nextjsPlugin'

export function addNextjsError(error: Error & { digest?: string }, context?: Record<string, unknown>) {
  const publicApi = getGlobalPublicApi()
  if (!publicApi) {
    return
  }
  const nextjsContext = context?.nextjs instanceof Object ? (context.nextjs as Record<string, unknown>) : {}
  publicApi.addError(error, {
    ...context,
    framework: 'nextjs',
    // digest is a hash Next.js attaches to server-side errors, linking client errors to server logs
    ...(error.digest !== undefined && { nextjs: { ...nextjsContext, digest: error.digest } }),
  })
}
