const path = require('path')
const karmaBase = require('./karma.base.conf')
const karmaBaseConf = karmaBase(['packages/*/+(src|test)/**/*.spec.ts', 'developer-extension/src/**/*.spec.ts'])

module.exports = function (config) {
  config.set({
    ...karmaBaseConf,
    reporters: ['coverage-istanbul', ...karmaBaseConf.reporters],
    browsers: ['ChromeHeadlessNoSandbox'],
    coverageIstanbulReporter: {
      reports: ['html', 'text-summary', 'json'],
      dir: path.join(__dirname, '../../coverage'),
    },
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },
    webpack: {
      ...karmaBaseConf.webpack,
      module: withIstanbulRule(karmaBaseConf.webpack.module),
    },
    sourceMapLoader: {
      remapSource: (source) => source.replace(/webpack:\/\//g, path.join(__dirname, '../../')),
    },
  })
}

function withIstanbulRule(module) {
  module.rules.push({
    test: /^.*\.ts$/,
    exclude: [/.*\.spec\.ts$/, /.*\.d\.ts$/, /.*capturedExceptions\.ts$/, /.*specHelper\.ts$/, /node_modules/],
    enforce: 'post',
    use: {
      loader: '@jsdevtools/coverage-istanbul-loader',
      options: {
        esModules: true,
      },
    },
  })
  return module
}
