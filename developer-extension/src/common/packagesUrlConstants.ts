export const DEV_SERVER_ORIGIN = 'http://localhost:8080'
export const DEV_LOGS_URL = `${DEV_SERVER_ORIGIN}/datadog-logs.js`
export const DEV_RUM_SLIM_URL = `${DEV_SERVER_ORIGIN}/datadog-rum-slim.js`
export const DEV_RUM_URL = `${DEV_SERVER_ORIGIN}/datadog-rum.js`

// To follow web-ui development, this version will need to be manually updated from time to time.
// When doing that, be sure to update types and implement any protocol changes.
export const PROD_REPLAY_SANDBOX_VERSION = '0.119.0'
export const PROD_REPLAY_SANDBOX_ORIGIN = 'https://session-replay-datadoghq.com'
export const PROD_REPLAY_SANDBOX_URL = `${PROD_REPLAY_SANDBOX_ORIGIN}/${PROD_REPLAY_SANDBOX_VERSION}/index.html`

export const DEV_REPLAY_SANDBOX_ORIGIN = 'https://localhost:8443'
export const DEV_REPLAY_SANDBOX_URL = `${DEV_REPLAY_SANDBOX_ORIGIN}/static-apps/replay-sandbox/public/index.html`
