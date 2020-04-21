const path = require('path')
const { exec } = require('child_process')
const { unlinkSync } = require('fs')
const { CurrentSpecReporter } = require('./currentSpecReporter')

let servers

module.exports = {
  runner: 'local',
  specs: ['./test/e2e/scenario/*.scenario.ts'],
  maxInstances: 5,
  logLevel: 'warn',
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 0,
  framework: 'jasmine',
  reporters: ['spec'],
  jasmineNodeOpts: {
    defaultTimeoutInterval: 60000,
    requires: [path.resolve(__dirname, './ts-node')],
  },
  e2eMode: process.env.E2E_MODE || 'bundle',
  onPrepare: function() {
    try {
      unlinkSync('test/server/test-server.log')
    } catch (e) {
      console.log(e.message)
    }
    servers = [
      // browserstack allowed ports https://www.browserstack.com/question/664
      // Test server same origin
      exec('PORT=3000 node test/server/server'),
      // Test server cross origin
      exec('PORT=3002 node test/server/server'),
      // Intake server
      exec('PORT=4000 node test/server/server'),
    ]
  },
  before: function() {
    jasmine.getEnv().addReporter(new CurrentSpecReporter())
  },
  onComplete: function() {
    servers.forEach((server) => server.kill())
  },
}
