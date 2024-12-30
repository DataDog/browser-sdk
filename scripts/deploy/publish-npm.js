const fs = require('fs')
const { printLog, runMain } = require('../lib/executionUtils')
const { command } = require('../lib/command')
const { getNpmToken } = require('../lib/secrets')

runMain(() => {
  printLog('Building the project')
  command`yarn build`.withEnvironment({ BUILD_MODE: 'release' }).run()

  printLog('Publishing')
  // eslint-disable-next-line no-template-curly-in-string
  fs.writeFileSync('.npmrc', '//registry.npmjs.org/:_authToken=${NPM_TOKEN}')
  command`yarn lerna publish from-package --yes`.withEnvironment({ NPM_TOKEN: getNpmToken() }).run()
})
