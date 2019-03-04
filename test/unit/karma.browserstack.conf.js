const path = require('path')
const karmaBaseConf = require('./karma.base.conf')
const browsers = require('./browsers.conf')

// force entry resolution to ensure sinon code is in ES5
// https://github.com/webpack/webpack/issues/5756
// https://github.com/sinonjs/sinon/blob/894951c/package.json#L113
karmaBaseConf.webpack.resolve.mainFields = ['cdn', 'main']

module.exports = function(config) {
  config.set({
    ...karmaBaseConf,
    frameworks: karmaBaseConf.frameworks.concat(['polyfills']),
    plugins: ['karma-*', { 'framework:polyfills': ['factory', polyfills] }],
    browserStack: {
      username: process.env.BS_USERNAME,
      accessKey: process.env.BS_ACCESS_KEY,
    },
    browsers: Object.keys(browsers),
    customLaunchers: browsers,
    concurrency: 5,
  })
}

const polyfills = function(files) {
  // Fix "'Uint8Array' is undefined
  files.unshift({
    pattern: path.resolve('./node_modules/js-polyfills/typedarray.js'),
    included: true,
    served: true,
    watched: false,
  })
}

polyfills.$inject = ['config.files']
