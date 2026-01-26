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
* If your PR requires rum-events-format changes, make sure to run \`yarn json-schemas:sync\`.
* Else, you probably updated the rum-events-format submodule by mistake. To revert it, run something like:
  git checkout $(git merge-base main HEAD) rum-events-format
  git submodule update rum-events-format
`)

    process.exit(1)
  }
})
