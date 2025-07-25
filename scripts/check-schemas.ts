import { printLog, printError, runMain } from './lib/executionUtils'
import { command } from './lib/command'

runMain(() => {
  printLog('Regenerating schemas...')
  command`scripts/cli build_json2type`.run()
  command`node scripts/generate-schema-types.js`.run()

  printLog('Checking untracked changes...')
  const diff = command`git diff --color`.run()

  if (diff) {
    printLog(diff)
    printError('\nUntracked changes detected, ensure that schemas and types are in-sync.\n')
    process.exit(1)
  }
})
