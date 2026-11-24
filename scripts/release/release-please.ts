// Release job, run on every push to main: tag and draft-release a merged release pull request,
// then open or update the next one. Runs the release-please CLI with our custom release type.
//
// Local dry run: `node scripts/release/release-please.ts --dry-run --target-branch <branch>`
// (uses the `gh` token instead of dd-octo-sts).
//
// Not part of release-please's public API: the CLI and the Node strategy are deep imports. The
// package entry point must be loaded first (circular imports between strategies).
import { parseArgs } from 'node:util'
import { registerReleaseType } from 'release-please'
import type { ConventionalCommit } from 'release-please/build/src/commit.js'
import { Node } from 'release-please/build/src/strategies/node.js'
import { parser } from 'release-please/build/src/bin/release-please.js'
import { command } from '../lib/command.ts'
import { runMain } from '../lib/executionUtils.ts'
import { getGithubReleasePleaseToken } from '../lib/secrets.ts'
import { checkReleaseNotes } from '../lib/checkReleaseNotes.ts'

export const BROWSER_SDK_RELEASE_TYPE = 'browser-sdk'
const JS_CORE_SCOPE = 'js-core'

/**
 * Release type of the Browser SDK (root component). The root receives every commit, including the
 * ones only changing @datadog/js-core. A breaking change in js-core alone (`feat(js-core)!: …`) must
 * only bump js-core (pre-1.0, so a minor): for the Browser SDK, it is a regular commit.
 */
export class BrowserSdkStrategy extends Node {
  async postProcessCommits(commits: ConventionalCommit[]): Promise<ConventionalCommit[]> {
    return (await super.postProcessCommits(commits)).map(ignoreJsCoreBreakingChange)
  }
}

export function ignoreJsCoreBreakingChange(commit: ConventionalCommit): ConventionalCommit {
  if (!commit.breaking || commit.scope?.trim() !== JS_CORE_SCOPE) {
    return commit
  }
  return {
    ...commit,
    breaking: false,
    notes: commit.notes.filter(({ title }) => title !== 'BREAKING CHANGE'),
    // The changelog writer also adds a breaking change note when the header has a `!`.
    message: commit.message.replace(/^([a-z]+\([^()]*\))!:/, '$1:'),
  }
}

export function registerBrowserSdkReleaseType() {
  registerReleaseType(BROWSER_SDK_RELEASE_TYPE, (options) => new BrowserSdkStrategy(options))
}

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(async () => {
    const { values } = parseArgs({
      options: { 'dry-run': { type: 'boolean', default: false }, 'target-branch': { type: 'string', default: 'main' } },
    })
    await main({ dryRun: values['dry-run'], targetBranch: values['target-branch'] })
  })
}

async function main({ dryRun, targetBranch }: { dryRun: boolean; targetBranch: string }) {
  registerBrowserSdkReleaseType()

  if (dryRun) {
    const token = command`gh auth token`.run().trim()
    await runReleasePlease('release-pr', token, targetBranch, ['--dry-run'])
    return
  }

  // Fail before tagging if a pending release pull request was merged without listing every change.
  await checkReleaseNotes(targetBranch)

  using token = getGithubReleasePleaseToken()
  await runReleasePlease('github-release', token.value, targetBranch)
  await runReleasePlease('release-pr', token.value, targetBranch)
}

interface YargsParser {
  exitProcess: (enabled: boolean) => YargsParser
  fail: (enabled: false) => YargsParser
  parseAsync: (args: string[]) => Promise<unknown>
}

async function runReleasePlease(
  releasePleaseCommand: 'github-release' | 'release-pr',
  token: string,
  targetBranch: string,
  extraArgs: string[] = []
) {
  // Typed with yargs, whose types are not installed.
  const cli = parser as unknown as YargsParser
  // Reject instead of exiting the process on errors, so the token is still revoked.
  await cli
    .exitProcess(false)
    .fail(false)
    .parseAsync([
      releasePleaseCommand,
      '--token',
      token,
      '--repo-url',
      'DataDog/browser-sdk',
      '--target-branch',
      targetBranch,
      ...extraArgs,
    ])
}
