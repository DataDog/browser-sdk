import fs from 'node:fs'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { getNpmToken } from '../lib/secrets.ts'

runMain(() => {
  printLog('Building the project')
  command`yarn build`.withEnvironment({ BUILD_MODE: 'release' }).run()

  printLog('Publishing')
  // eslint-disable-next-line no-template-curly-in-string
  fs.writeFileSync('.npmrc', '//registry.npmjs.org/:_authToken=${NPM_TOKEN}')
  command`yarn lerna publish from-package --yes`.withEnvironment({ NPM_TOKEN: getNpmToken() }).run()
})
