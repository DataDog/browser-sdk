const { withDatadogRum } = require('@datadog/browser-rum-nextjs/config')

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ['dd-trace'],
  outputFileTracingIncludes: {
    '/*': ['./node_modules/dd-trace/**/*', './node_modules/@datadog/**/*', './node_modules/dc-polyfill/**/*', './node_modules/import-in-the-middle/**/*', './node_modules/@opentelemetry/**/*', './node_modules/oxc-parser/**/*', './node_modules/require-in-the-middle/**/*', './node_modules/semver/**/*', './node_modules/lru-cache/**/*', './node_modules/module-details-from-path/**/*', './node_modules/node-gyp-build/**/*'],
  },
}

module.exports = withDatadogRum(nextConfig)
