const { exec } = require('child_process')
let appProcess
let intakeProcess

module.exports = {
  runner: 'local',
  specs: ['./test/e2e/scenario/*.scenario.ts'],
  maxInstances: 1,
  logLevel: 'warn',
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 0,
  framework: 'jasmine',
  reporters: ['spec'],
  jasmineNodeOpts: {
    defaultTimeoutInterval: 60000,
  },
  e2eMode: process.env.E2E_MODE || 'bundle',
  onPrepare: function() {
    appProcess = exec('PORT=3000 node test/server/server')
    intakeProcess = exec('PORT=4000 node test/server/server')
  },
  before: function() {
    require('ts-node').register({
      files: true,
      project: 'test/e2e/scenario/tsconfig.json',
    })
  },
  onComplete: function() {
    appProcess.kill()
    intakeProcess.kill()
  },
}
