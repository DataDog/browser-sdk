import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { fetchPR, getLastCommonCommit, LOCAL_BRANCH } from '../lib/gitUtils.ts'
import { getBrowserStackUsername, getBrowserStackAccessKey } from '../lib/secrets.ts'

// Patterns that should trigger BrowserStack tests (git pathspecs)
const RELEVANT_FILE_PATTERNS = [
  'packages/*',
  'test/*',
  'developer-extension/*',
  'scripts/test/*',
  'package.json',
  'yarn.lock',
  'tsconfig*',
  'webpack.base.ts',
]

runMain(async () => {
  const testCommand = process.argv[2]
  if (!testCommand) {
    throw new Error('Usage: ci-bs.ts <test:unit|test:e2e:ci>')
  }

  const pr = await fetchPR(LOCAL_BRANCH!)
  const baseBranch = pr?.base.ref ?? 'main'
  const baseCommit = getLastCommonCommit(baseBranch)

  if (!hasRelevantChanges(baseCommit)) {
    printLog('No code changes affecting browser behavior detected. Skipping BrowserStack tests.')
    return
  }

  command`yarn ${testCommand}:bs`
    .withEnvironment({
      BS_USERNAME: getBrowserStackUsername(),
      BS_ACCESS_KEY: getBrowserStackAccessKey(),
    })
    .withLogs()
    .run()
})

function hasRelevantChanges(baseCommit: string): boolean {
  const changedFiles = command`git diff --name-only ${baseCommit} HEAD -- ${RELEVANT_FILE_PATTERNS}`.run()

  if (changedFiles.trim()) {
    printLog(`Matched files:\n${changedFiles}`)
    return true
  }

  return false
}
