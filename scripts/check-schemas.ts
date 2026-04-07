import { printLog, printError, runMain } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'

runMain(() => {
  if (command`git status --porcelain`.run()) {
    throw new Error('This script should be run from a clean working tree')
  }

  printLog('Regenerating schemas...')
  command`scripts/cli build_json2type`.run()
  command`node scripts/generate-schema-types.ts`.run()

  printLog('Checking untracked changes...')
  const diff = command`git diff --color`.run()
  if (diff) {
    printLog(diff)
    printError(`
Untracked changes detected.
* If your PR changes remote configuration schemas, run \`yarn json-schemas:generate\`.
* Else, revert the generated remote configuration types before merging.
`)

    process.exit(1)
  }
})
