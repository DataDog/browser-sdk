import { printLog, printError, runMain } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'

runMain(() => {
  printLog('Regenerating schemas...')
  command`scripts/cli build_json2type`.run()
  command`node scripts/generate-schema-types.ts`.run()

  printLog('Checking untracked changes...')
  const diff = command`git diff --color`.run()

  if (diff) {
    printLog(diff)
    printError('\nUntracked changes detected, ensure that schemas and types are in-sync.\n')
    process.exit(1)
  }
})
