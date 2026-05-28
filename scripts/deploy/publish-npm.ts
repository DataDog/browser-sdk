import { parseArgs } from 'node:util'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { getNpmToken } from '../lib/secrets.ts'

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main())
}

export function main(args = process.argv.slice(2)): void {
  const {
    values: { 'dry-run': dryRun },
  } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean', default: false },
    },
  })

  printLog('Building')
  // Usually we don't need to build packages before publishing them, because yarn will call each
  // `prepack` script to build packages during "yarn npm publish".
  //
  // But when things go wrong and some packages fail to be published, and we want to retry the job,
  // yarn will skip already published packages (--tolerate-republish) so if any unpublished package
  // depends on an already published one for their build, the build will fail.
  command`yarn build`.withEnvironment({ BUILD_MODE: 'release' }).run()

  printLog(dryRun ? 'Publishing (dry run)' : 'Publishing')
  try {
    command`yarn workspaces foreach --verbose --all --topological --no-private npm publish --tolerate-republish --access public ${dryRun ? ['--dry-run'] : []}`
      .withEnvironment({
        YARN_NPM_AUTH_TOKEN: dryRun ? '' : getNpmToken(),
        BUILD_MODE: 'release',
      })
      .withLogs()
      .run()
  } catch (error) {
    throw new Error('NPM publish failed. Run `node ./scripts/release/renew-token.ts` and retry the job.', {
      cause: error as Error,
    })
  }
}
