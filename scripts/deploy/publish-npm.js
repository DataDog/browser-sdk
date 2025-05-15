const fs = require('fs')
const { printLog, runMain } = require('../lib/executionUtils')
const { command } = require('../lib/command')
const { getNpmToken } = require('../lib/secrets')
const dotenv = require('dotenv')
dotenv.config()

runMain(() => {
  printLog('Building the project')
  command`yarn build`.withEnvironment({ BUILD_MODE: 'release' }).run()
  if (!process.env.NPM_TOKEN) {
    throw new Error('NPM_TOKEN is not set')
  }
  printLog('Publishing')
  // eslint-disable-next-line no-template-curly-in-string
  fs.writeFileSync('.npmrc', `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`)
  command`yarn lerna publish from-package --yes`.withEnvironment({ NPM_TOKEN: process.env.NPM_TOKEN }).run()
})
