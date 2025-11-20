import tracer from 'dd-trace'
import { app } from 'electron'

export function initTracer(service: string, env: string, version: string) {
  tracer.init({
    service,
    env,
    version,
    tags: {
      electron: {
        appName: app.getName(),
        appVersion: app.getVersion(),
        version: process.versions.electron,
      },
      node: {
        version: process.versions.node,
      },
      os: {
        platform: process.platform,
        release: process.release,
      },
      chrome: {
        version: process.versions.chrome,
      },
      env: 'prod',
    },
  })
}
// initialized in a different file to avoid hoisting.
export default tracer // eslint-disable-line import/no-default-export
