import tracer from 'dd-trace'

export function initTracer(service: string, env: string, version: string) {
  tracer.init({
    service,
    env,
    version,
  })
}
// initialized in a different file to avoid hoisting.
export default tracer // eslint-disable-line import/no-default-export
