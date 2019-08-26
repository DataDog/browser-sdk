const karmaBaseConf = require('./karma.base.conf')
const browsers = require('./browsers.conf')

module.exports = function(config) {
  config.set({
    ...karmaBaseConf,
    plugins: ['karma-*', 'karma-cbt-launcher'],
    reporters: [...karmaBaseConf.reporters, 'CrossBrowserTesting'],
    browsers: Object.keys(browsers),
    cbtConfig: {
      username: process.env.CBT_USERNAME,
      authkey: process.env.CBT_AUTHKEY,
    },
    customLaunchers: browsers,
  })
}
