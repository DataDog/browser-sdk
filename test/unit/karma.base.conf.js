const path = require('path')
const webpackConfig = require('../../webpack.config')(null, { mode: 'development' })

module.exports = {
  basePath: '../..',
  files: ['src/**/*.ts'],
  exclude: ['src/**/*.d.ts'],
  frameworks: ['jasmine'],
  client: {
    jasmine: {
      random: true,
    },
  },
  preprocessors: {
    'src/**/*.ts': ['webpack'],
  },
  reporters: ['coverage-istanbul', 'spec'],
  specReporter: {
    suppressErrorSummary: true,
    suppressPassed: true,
    suppressSkipped: true,
  },
  coverageIstanbulReporter: {
    reports: ['html', 'text-summary'],
    dir: path.join(__dirname, '../../coverage'),
  },
  singleRun: true,
  webpack: {
    mode: 'development',
    stats: 'minimal',
    module: withIstanbulRule(webpackConfig.module),
    plugins: webpackConfig.plugins,
    resolve: webpackConfig.resolve,
  },
  webpackMiddleware: {
    stats: 'errors-only',
    logLevel: 'warn',
  },
}

function withIstanbulRule(module) {
  module.rules.push({
    test: /^.*\.ts$/,
    exclude: [/.*\.spec\.ts$/, /.*\.d\.ts$/, /.*capturedExceptions\.ts$/, /.*specHelper\.ts$/],
    enforce: 'post',
    use: {
      loader: 'istanbul-instrumenter-loader',
      options: {
        esModules: true,
      },
    },
  })
  return module
}
