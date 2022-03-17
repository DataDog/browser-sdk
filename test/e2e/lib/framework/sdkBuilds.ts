import * as path from 'path'

const ROOT = path.join(__dirname, '../../../..')
export const RUM_BUNDLE = path.join(ROOT, 'packages/rum/bundle/datadog-rum.js')
export const RUM_SLIM_BUNDLE = path.join(ROOT, 'packages/rum-slim/bundle/datadog-rum-slim.js')
export const LOGS_BUNDLE = path.join(ROOT, 'packages/logs/bundle/datadog-logs.js')
export const NPM_BUNDLE = path.join(ROOT, 'test/app/dist/app.js')
