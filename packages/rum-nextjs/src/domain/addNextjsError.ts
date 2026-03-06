import { getGlobalPublicApi } from './nextjsPlugin'

export function addNextjsError(error: Error & { digest?: string }, context?: Record<string, unknown>) {
  const publicApi = getGlobalPublicApi()
  if (!publicApi) {
    return
  }
  publicApi.addError(error, {
    framework: 'nextjs',
    ...context,
    // digest is a hash Next.js attaches to server-side errors, linking client errors to server logs
    ...(error.digest !== undefined && { nextjs: { digest: error.digest } }),
  })
}
