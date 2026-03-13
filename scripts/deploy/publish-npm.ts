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

  printLog('Building the project')
  command`yarn build`.withEnvironment({ BUILD_MODE: 'release' }).run()

  printLog(dryRun ? 'Publishing (dry run)' : 'Publishing')
  command`yarn workspaces foreach --all --no-private --include @datadog/* npm publish --access public ${dryRun ? ['--dry-run'] : []}`
    .withEnvironment({ YARN_NPM_AUTH_TOKEN: dryRun ? '' : getNpmToken() })
    .withLogs()
    .run()
})
