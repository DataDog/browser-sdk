import * as path from 'path'

const ROOT = path.join(__dirname, '../../../..')
export const RUM_BUNDLE = path.join(ROOT, 'packages/rum/bundle/datadog-rum.js')
export const rumBundleRecorderChunk = (name: string, hash: string) =>
  path.join(ROOT, `packages/rum/bundle/chunks/${name}-${hash}-datadog-rum.js`)
export const RUM_SLIM_BUNDLE = path.join(ROOT, 'packages/rum-slim/bundle/datadog-rum-slim.js')
export const LOGS_BUNDLE = path.join(ROOT, 'packages/logs/bundle/datadog-logs.js')
export const WORKER_BUNDLE = path.join(ROOT, 'packages/worker/bundle/worker.js')
export const NPM_BUNDLE = path.join(ROOT, 'test/app/dist/app.js')
export const NPM_REACT_BUNDLE = path.join(ROOT, 'test/react-app/dist/react-app.js')
export const npmBundleChunks = (name: string, hash: string) =>
  path.join(ROOT, `test/app/dist/chunks/${name}-${hash}-app.js`)
export const npmBundleChunksReact = (name: string, hash: string) =>
  path.join(ROOT, `test/react-app/dist/chunks/${name}-${hash}-react-app.js`)
