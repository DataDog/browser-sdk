process.env.AWS_LAMBDA_FUNCTION_NAME = 'fake-electron'
import tracer from 'dd-trace'

export function initTracer(service: string, env: string, version: string) {
  tracer.init({
    service,
    env,
    version,
    experimental: {
      exporter: 'agent',
    },
  })
}
// initialized in a different file to avoid hoisting.
export default tracer // eslint-disable-line import/no-default-export
