import { printLog, printError, runMain } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'

runMain(() => {
  if (command`git status --porcelain`.run()) {
    throw new Error('This script should be run from a clean working tree')
  }

  printLog('Regenerating schemas...')
  command`node scripts/json-schemas.ts --build`.run()

  printLog('Checking untracked changes...')
  const diff = command`git diff --color`.run()
  if (diff) {
    printLog(diff)
    printError(`
Untracked changes detected.
* If your PR requires rum-events-format changes, make sure to run \`yarn json-schemas:sync\`.
* Else, you probably updated the @datadog/rum-events-format ref by mistake. To revert it, restore
  the previous ref in package.json and run \`yarn install\`.
`)

    process.exit(1)
  }
})
