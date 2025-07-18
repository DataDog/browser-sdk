import fs from 'fs'
import path from 'path'

import { printLog, runMain } from '../lib/executionUtils.js'
import { command } from '../lib/command.js'

runMain(() => {
  printLog('Packing packages...')
  command`yarn lerna run pack`.run()

  buildApp('test/apps/vanilla')
  buildApp('test/apps/react')

  printLog('Test apps and extensions built successfully.')
})

function buildApp(appPath) {
  printLog(`Building app at ${appPath}...`)
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(appPath).run()
  command`yarn build`.withCurrentWorkingDirectory(appPath).run()
}
