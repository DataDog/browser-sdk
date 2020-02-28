const webpackConfig = require('../../webpack.base')('development')

module.exports = {
  basePath: '../..',
  files: ['packages/*/+(src|test)/**/*.ts'],
  frameworks: ['jasmine'],
  client: {
    jasmine: {
      random: true,
      oneFailurePerSpec: true,
    },
  },
  preprocessors: {
    'packages/*/+(src|test)/**/*.ts': ['webpack'],
  },
  reporters: ['spec'],
  specReporter: {
    suppressErrorSummary: true,
    suppressPassed: true,
    suppressSkipped: true,
  },
  singleRun: true,
  webpack: {
    mode: webpackConfig.mode,
    stats: 'minimal',
    module: webpackConfig.module,
    resolve: webpackConfig.resolve,
  },
  webpackMiddleware: {
    stats: 'errors-only',
    logLevel: 'warn',
  },
  beforeMiddleware: ['custom'],
  plugins: ['karma-*', { 'middleware:custom': ['factory', CustomMiddlewareFactory] }],
}

function CustomMiddlewareFactory() {
  return function(request, response, next) {
    if (request.url === '/ok') {
      response.writeHead(200)
      return response.end('ok')
    }
    if (request.url === '/throw') {
      throw 'expected server error'
    }
    return next()
  }
}
