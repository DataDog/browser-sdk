import { parseArgs } from 'node:util'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { getNpmToken } from '../lib/secrets.ts'

runMain(() => {
  const {
    values: { 'dry-run': dryRun },
  } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
    },
  })

  printLog(dryRun ? 'Publishing (dry run)' : 'Publishing')
  command`yarn workspaces foreach --verbose --all --topological --no-private npm publish --access public ${dryRun ? ['--dry-run'] : []}`
    .withEnvironment({
      YARN_NPM_AUTH_TOKEN: dryRun ? '' : getNpmToken(),
      BUILD_MODE: 'release',
    })
    .withLogs()
    .run()
})
