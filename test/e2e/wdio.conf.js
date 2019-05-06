const { exec } = require('child_process')
let serverProcess

exports.config = {
  runner: 'local',
  specs: ['./test/e2e/**/*.scenario.ts'],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless', '--no-sandbox'],
      },
    },
  ],
  logLevel: 'warn',
  baseUrl: 'http://localhost:3000',
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 0,
  services: ['selenium-standalone'],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  onPrepare: function() {
    serverProcess = exec('ts-node --project test/e2e/tsconfig.e2e.json test/e2e/server/server')
  },
  before: function() {
    require('ts-node').register({
      files: true,
      project: 'test/e2e/tsconfig.e2e.json',
    })
  },
  onComplete: function() {
    serverProcess.kill()
  },
}
