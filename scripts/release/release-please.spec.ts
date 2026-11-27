import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GitHub } from 'release-please'
import { getReleaserTypes } from 'release-please'
// Not part of release-please's public API: used to run our strategy like release-please does.
import { parseConventionalCommits } from 'release-please/build/src/commit.js'
import { DefaultChangelogNotes } from 'release-please/build/src/changelog-notes/default.js'
import { DefaultVersioningStrategy } from 'release-please/build/src/versioning-strategies/default.js'
import { Version } from 'release-please/build/src/version.js'
import { TagName } from 'release-please/build/src/util/tag-name.js'
import { PullRequestBody } from 'release-please/build/src/util/pull-request-body.js'
import { Changelog } from 'release-please/build/src/updaters/changelog.js'
import type { CandidateReleasePullRequest } from 'release-please/build/src/manifest.js'
import releasePleaseConfig from '../../release-please-config.json' with { type: 'json' }
import {
  BROWSER_SDK_RELEASE_TYPE,
  BrowserSdkStrategy,
  JS_CORE_DEPENDENCY_NOTES_PLUGIN,
  JsCoreDependencyNotes,
  registerBrowserSdkReleaseType,
} from './release-please.ts'

const rootPackage = releasePleaseConfig.packages['.']
const jsCorePackage = releasePleaseConfig.packages['packages/js-core']

describe('release-please Browser SDK release type', () => {
  it('is the release type of the Browser SDK', () => {
    registerBrowserSdkReleaseType()
    assert.equal(rootPackage['release-type'], BROWSER_SDK_RELEASE_TYPE)
    assert.ok(getReleaserTypes().includes(BROWSER_SDK_RELEASE_TYPE))
  })

  it('treats a breaking change in js-core alone as a regular commit', async () => {
    // The PR title lint trims scopes, release-please doesn't.
    for (const title of ['feat(js-core)!: Drop the legacy transport', 'feat( js-core )!: Drop the legacy transport']) {
      const release = await buildBrowserSdkRelease(title)

      assert.equal(release.version, '7.20.0', title)
      assert.doesNotMatch(release.notes, /BREAKING/, title)
      assert.match(release.notes, /### Features\n\n\* \*\* ?js-core ?:\*\* Drop the legacy transport/, title)
    }
  })

  it('keeps breaking changes on Browser SDK packages', async () => {
    for (const title of ['feat(rum)!: Require a view name', 'feat(core,js-core)!: Rename the context API']) {
      const release = await buildBrowserSdkRelease(title)

      assert.equal(release.version, '8.0.0', title)
      assert.match(release.notes, /### ⚠ BREAKING CHANGES/, title)
    }
  })

  it('does not list the commits that only change js-core in the Browser SDK notes', async () => {
    const notes = await buildBrowserSdkReleaseNotes([
      { message: 'feat(js-core): Add a transport option', files: ['packages/js-core/src/transport.ts'] },
      { message: 'fix(rum): Fix the view name', files: ['packages/browser-rum-core/src/view.ts'] },
      {
        message: 'feat(js-core): Pass the SDK version',
        files: ['packages/js-core/src/endpoint.ts', 'packages/browser-core/src/telemetry.ts'],
      },
    ])

    assert.doesNotMatch(notes.text, /Add a transport option/)
    assert.match(notes.text, /Fix the view name/)
    assert.match(notes.text, /Pass the SDK version/)
    assert.equal(notes.isEmpty, false)
  })

  it('releases the Browser SDK when only js-core changes', async () => {
    const notes = await buildBrowserSdkReleaseNotes([
      { message: 'fix(js-core): Fix the retry delay', files: ['packages/js-core/src/transport.ts'] },
    ])

    assert.doesNotMatch(notes.text, /Fix the retry delay/)
    assert.equal(notes.isEmpty, false)
  })

  it('does not release the Browser SDK for hidden js-core commits', async () => {
    const notes = await buildBrowserSdkReleaseNotes([
      { message: 'staging(ci): Bump staging', files: ['packages/js-core/package.json'] },
    ])

    assert.equal(notes.isEmpty, true)
  })

  it('adds the js-core version to the Browser SDK notes and changelog', async () => {
    assert.deepEqual(releasePleaseConfig.plugins, [JS_CORE_DEPENDENCY_NOTES_PLUGIN])
    const rootNotes = '## [7.20.0](https://github.com/DataDog/browser-sdk/compare/v7.19.0...v7.20.0) (2026-11-27)'
    const changelog = new Changelog({ version: Version.parse('7.20.0'), changelogEntry: rootNotes })
    const root = {
      path: '.',
      pullRequest: {
        version: Version.parse('7.20.0'),
        body: new PullRequestBody([{ component: '', version: Version.parse('7.20.0'), notes: rootNotes }]),
        updates: [{ path: 'CHANGELOG.md', createIfMissing: true, updater: changelog }],
      },
    } as unknown as CandidateReleasePullRequest
    const jsCore = {
      path: 'packages/js-core',
      pullRequest: { version: Version.parse('0.0.24') },
    } as unknown as CandidateReleasePullRequest

    await new JsCoreDependencyNotes({} as GitHub, 'main', {}).run([root, jsCore])

    const expected = `${rootNotes}\n\n\n### Dependencies\n\n* Update @datadog/js-core to 0.0.24\n`
    assert.equal(changelog.changelogEntry, expected)
    assert.equal(root.pullRequest.body.releaseData[0].notes, expected)
  })

  it('adds no js-core entry when js-core is not released', async () => {
    const rootNotes = '## [7.20.0](https://github.com/DataDog/browser-sdk/compare/v7.19.0...v7.20.0) (2026-11-27)'
    const root = {
      path: '.',
      pullRequest: {
        body: new PullRequestBody([{ component: '', version: Version.parse('7.20.0'), notes: rootNotes }]),
        updates: [],
      },
    } as unknown as CandidateReleasePullRequest

    await new JsCoreDependencyNotes({} as GitHub, 'main', {}).run([root])

    assert.equal(root.pullRequest.body.releaseData[0].notes, rootNotes)
  })

  it('bumps js-core a minor version for its breaking changes', () => {
    const versioningStrategy = new DefaultVersioningStrategy({
      bumpMinorPreMajor: jsCorePackage['bump-minor-pre-major'],
      bumpPatchForMinorPreMajor: jsCorePackage['bump-patch-for-minor-pre-major'],
    })
    const commits = parse('feat(js-core)!: Drop the legacy transport')

    assert.equal(versioningStrategy.bump(Version.parse('0.0.22'), commits).toString(), '0.1.0')
  })
})

async function buildBrowserSdkRelease(title: string) {
  const strategy = new BrowserSdkStrategy({
    github: { repository: { owner: 'DataDog', repo: 'browser-sdk', defaultBranch: 'main' } } as GitHub,
    targetBranch: 'main',
    path: '.',
  })
  const commits = await strategy.postProcessCommits(parse(title))
  const version = new DefaultVersioningStrategy().bump(Version.parse('7.19.0'), commits).toString()
  const notes = await new DefaultChangelogNotes().buildNotes(commits, {
    owner: 'DataDog',
    repository: 'browser-sdk',
    version,
    currentTag: `v${version}`,
    targetBranch: 'main',
    changelogSections: releasePleaseConfig['changelog-sections'],
  })
  return { version, notes }
}

async function buildBrowserSdkReleaseNotes(commits: Array<{ message: string; files: string[] }>) {
  // Exposes the protected methods that release-please calls to build the release notes.
  class TestStrategy extends BrowserSdkStrategy {
    buildNotes(...args: Parameters<BrowserSdkStrategy['buildReleaseNotes']>) {
      return this.buildReleaseNotes(...args)
    }
    isEmpty(notes: string) {
      return this.changelogEmpty(notes)
    }
  }
  const strategy = new TestStrategy({
    github: { repository: { owner: 'DataDog', repo: 'browser-sdk', defaultBranch: 'main' } } as GitHub,
    targetBranch: 'main',
    path: '.',
    changelogSections: releasePleaseConfig['changelog-sections'],
  })
  const conventionalCommits = parseConventionalCommits(commits.map((commit) => ({ sha: 'a'.repeat(40), ...commit })))
  const text = await strategy.buildNotes(
    conventionalCommits,
    Version.parse('7.20.0'),
    new TagName(Version.parse('7.20.0'), '', 'v')
  )
  return { text, isEmpty: strategy.isEmpty(text) }
}

function parse(title: string) {
  return parseConventionalCommits([{ sha: 'a'.repeat(40), message: title, files: [] }])
}
