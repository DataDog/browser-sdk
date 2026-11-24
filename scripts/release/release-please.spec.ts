import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GitHub } from 'release-please'
import { getReleaserTypes } from 'release-please'
// Not part of release-please's public API: used to run our strategy like release-please does.
import { parseConventionalCommits } from 'release-please/build/src/commit.js'
import { DefaultChangelogNotes } from 'release-please/build/src/changelog-notes/default.js'
import { DefaultVersioningStrategy } from 'release-please/build/src/versioning-strategies/default.js'
import { Version } from 'release-please/build/src/version.js'
import releasePleaseConfig from '../../release-please-config.json' with { type: 'json' }
import { BROWSER_SDK_RELEASE_TYPE, BrowserSdkStrategy, registerBrowserSdkReleaseType } from './release-please.ts'

const rootPackage = releasePleaseConfig.packages['.']
const jsCorePackage = releasePleaseConfig.packages['packages/js-core']

describe('release-please Browser SDK release type', () => {
  it('is the release type of the Browser SDK', () => {
    registerBrowserSdkReleaseType()
    assert.equal(rootPackage['release-type'], BROWSER_SDK_RELEASE_TYPE)
    assert.ok(getReleaserTypes().includes(BROWSER_SDK_RELEASE_TYPE))
  })

  it('treats a breaking change in js-core alone as a regular commit', async () => {
    const release = await buildBrowserSdkRelease('feat(js-core)!: Drop the legacy transport')

    assert.equal(release.version, '7.20.0')
    assert.doesNotMatch(release.notes, /BREAKING/)
    assert.match(release.notes, /### Features\n\n\* \*\*js-core:\*\* Drop the legacy transport/)
  })

  it('keeps breaking changes on Browser SDK packages', async () => {
    for (const title of ['feat(rum)!: Require a view name', 'feat(core,js-core)!: Rename the context API']) {
      const release = await buildBrowserSdkRelease(title)

      assert.equal(release.version, '8.0.0', title)
      assert.match(release.notes, /### ⚠ BREAKING CHANGES/, title)
    }
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

function parse(title: string) {
  return parseConventionalCommits([{ sha: 'a'.repeat(40), message: title, files: [] }])
}
