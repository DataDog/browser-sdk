import { printLog, printError, runMain } from './lib/executionUtils'
import { command } from './lib/command'

runMain(() => {
  printLog('Regenerating schemas...')
  command`scripts/cli build_json2type`.run()
  command`yarn exec ts-node scripts/generate-schema-types.ts`.run()

  printLog('Checking untracked changes...')
  const diff = command`git diff --color`.run()

  if (diff) {
    printLog(diff)
    printError('\nUntracked changes detected, ensure that schemas and types are in-sync.\n')
    process.exit(1)
  }
})
