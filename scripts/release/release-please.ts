// Runs the release-please CLI with our custom release type registered. Usage: same arguments as
// `yarn release-please`.
//
// Not part of release-please's public API: the CLI and the Node strategy are deep imports. The
// package entry point must be loaded first (circular imports between strategies).
import { registerReleaseType } from 'release-please'
import type { ConventionalCommit } from 'release-please/build/src/commit.js'
import { Node } from 'release-please/build/src/strategies/node.js'
import { parser } from 'release-please/build/src/bin/release-please.js'
import { runMain } from '../lib/executionUtils.ts'

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
  if (!commit.breaking || commit.scope !== JS_CORE_SCOPE) {
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
    registerBrowserSdkReleaseType()
    // Typed with yargs, whose types are not installed.
    const cli = parser as unknown as { parseAsync: (args: string[]) => Promise<unknown> }
    await cli.parseAsync(process.argv.slice(2))
  })
}
