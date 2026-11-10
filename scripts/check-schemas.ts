import { printLog, printError, runMain } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'

runMain(() => {
  if (command`git status --porcelain`.run()) {
    throw new Error('This script should be run from a clean working tree')
  }

  printLog('Copying schemas again and regenerating types...')
  command`node scripts/json-schemas.ts --check --build`.run()

  printLog('Checking untracked changes...')
  const status = command`git status --porcelain`.run()
  if (status) {
    printLog(status)
    printLog(command`git diff --color`.run())
    printError(`
Untracked changes detected.
* If your PR requires rum-events-format changes, make sure to run \`yarn json-schemas:sync\`.
* Never modify rum-events-format/schemas or the generated types by hand: change the schemas in the
  rum-events-format repository first, then run \`yarn json-schemas:sync\`.
`)

    process.exit(1)
  }
})
