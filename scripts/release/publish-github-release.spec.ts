import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, it, mock } from 'node:test'
import jsCorePackageJson from '../../packages/js-core/package.json' with { type: 'json' }
import { releaseVersion } from '../lib/browserSdkVersion.ts'
import type { GitHubRelease } from '../lib/gitUtils.ts'
import { mockModule } from '../deploy/lib/testHelpers.ts'

const SDK_TAG = `v${releaseVersion}`
const JS_CORE_TAG = `js-core-v${jsCorePackageJson.version}`

const CHANGELOG = `# Changelog

---

## ${SDK_TAG}

**Public Changes:**

- ✨ Add a feature ([#2](https://github.com/DataDog/browser-sdk/pull/2))

## v1.0.0

- 🐛 Fix a bug ([#1](https://github.com/DataDog/browser-sdk/pull/1))
`

describe('publish-github-release', () => {
  const findGitHubReleaseMock = mock.fn<(tag: string) => Promise<GitHubRelease | undefined>>()
  const publishGitHubReleaseMock =
    mock.fn<(releaseId: number, options: { makeLatest: boolean }) => Promise<GitHubRelease>>()
  const createGitHubReleaseMock = mock.fn<(params: { version: string; body: string }) => Promise<GitHubRelease>>()

  let main: (options?: { changelogPath?: string }) => Promise<void>
  let getReleaseBodyFromChangelog: (changelog: string, tag: string) => string
  let releases: GitHubRelease[]
  let temporaryDirectory: string
  let changelogPath: string

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/gitUtils.ts'), {
      findGitHubRelease: findGitHubReleaseMock,
      publishGitHubRelease: publishGitHubReleaseMock,
      createGitHubRelease: createGitHubReleaseMock,
    })
    ;({ main, getReleaseBodyFromChangelog } = await import('./publish-github-release.ts'))

    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-github-release-'))
    changelogPath = path.join(temporaryDirectory, 'CHANGELOG.md')
    fs.writeFileSync(changelogPath, CHANGELOG)
  })

  after(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  beforeEach(() => {
    releases = []
    findGitHubReleaseMock.mock.resetCalls()
    publishGitHubReleaseMock.mock.resetCalls()
    createGitHubReleaseMock.mock.resetCalls()

    findGitHubReleaseMock.mock.mockImplementation((tag) =>
      Promise.resolve(releases.find((release) => release.tag_name === tag))
    )
    publishGitHubReleaseMock.mock.mockImplementation((releaseId) =>
      Promise.resolve({ ...releases.find((release) => release.id === releaseId)!, draft: false })
    )
    createGitHubReleaseMock.mock.mockImplementation(({ version }) =>
      Promise.resolve(createRelease(99, version, { draft: false }))
    )
  })

  function createRelease(id: number, tag: string, { draft }: { draft: boolean }): GitHubRelease {
    return { id, tag_name: tag, draft, html_url: `https://github.com/DataDog/browser-sdk/releases/tag/${tag}` }
  }

  function getPublishCalls() {
    return publishGitHubReleaseMock.mock.calls.map((call) => call.arguments)
  }

  it('publishes the js-core draft, then the SDK draft as the latest release', async () => {
    releases = [createRelease(1, SDK_TAG, { draft: true }), createRelease(2, JS_CORE_TAG, { draft: true })]

    await main()

    assert.deepEqual(getPublishCalls(), [
      [2, { makeLatest: false }],
      [1, { makeLatest: true }],
    ])
    assert.equal(createGitHubReleaseMock.mock.callCount(), 0)
  })

  it('does not publish releases that are already published', async () => {
    releases = [createRelease(1, SDK_TAG, { draft: false }), createRelease(2, JS_CORE_TAG, { draft: false })]

    await main()

    assert.deepEqual(getPublishCalls(), [])
    assert.equal(createGitHubReleaseMock.mock.callCount(), 0)
  })

  it('publishes the SDK draft when js-core has no release', async () => {
    releases = [createRelease(1, SDK_TAG, { draft: true })]

    await main()

    assert.deepEqual(getPublishCalls(), [[1, { makeLatest: true }]])
  })

  it('creates the SDK release from CHANGELOG.md when there is no release', async () => {
    await main({ changelogPath })

    assert.deepEqual(getPublishCalls(), [])
    assert.deepEqual(
      createGitHubReleaseMock.mock.calls.map((call) => call.arguments),
      [
        [
          {
            version: SDK_TAG,
            body: '**Public Changes:**\n\n- ✨ Add a feature ([#2](https://github.com/DataDog/browser-sdk/pull/2))',
          },
        ],
      ]
    )
  })

  describe('getReleaseBodyFromChangelog', () => {
    it('returns the body of the last release', () => {
      assert.equal(
        getReleaseBodyFromChangelog(CHANGELOG, 'v1.0.0'),
        '- 🐛 Fix a bug ([#1](https://github.com/DataDog/browser-sdk/pull/1))'
      )
    })

    it('throws when the release is not in the changelog', () => {
      assert.throws(() => getReleaseBodyFromChangelog(CHANGELOG, 'v0.0.1'), /No release v0\.0\.1 found/)
    })
  })
})
