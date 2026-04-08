import { datadogOnRequestError } from 'dd-trace/next'

export async function register() {
  // Skip in Edge Runtime — dd-trace only works in Node.js
  if (process.env.NEXT_RUNTIME === 'edge') return

  // webpackIgnore tells Turbopack/Webpack to skip bundling dd-trace entirely,
  // leaving it as a native Node.js import resolved at runtime.
  const ddTrace = await import(/* webpackIgnore: true */ 'dd-trace')
  const tracer = ddTrace.default ?? ddTrace
  tracer.init({ service: 'nextjs-test-app', sampleRate: 1, flushInterval: 100 })
}

export const onRequestError = datadogOnRequestError
