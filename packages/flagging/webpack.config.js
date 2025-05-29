const path = require('path')

const webpackBase = require('../../webpack.base')

module.exports = (_env, argv) =>
  webpackBase({
    mode: argv.mode,
    // Use polyfill.ts as the entry point to ensure globalThis is defined before any other code runs.
    // This is necessary because @openfeature/web-sdk uses globalThis which is not available in older
    // browsers (like Chrome 63). The polyfill must run before any other code to prevent
    // "globalThis is not defined" errors.
    entry: path.resolve(__dirname, 'src/entries/polyfill.ts'),
    filename: 'datadog-flagging.js',
  })
