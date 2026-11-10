import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GitHub } from 'release-please'
// Not part of release-please's public API: used to check how it handles our config. The package
// entry point must be loaded first (circular imports between strategies).
import 'release-please'
import { Node } from 'release-please/build/src/strategies/node.js'
import { PullRequestBody } from 'release-please/build/src/util/pull-request-body.js'
import { Version } from 'release-please/build/src/version.js'
import releasePleaseConfig from '../../release-please-config.json' with { type: 'json' }
import releasePleaseManifest from '../../.release-please-manifest.json' with { type: 'json' }
import rootPackageJson from '../../package.json' with { type: 'json' }
import jsCorePackageJson from '../../packages/js-core/package.json' with { type: 'json' }
import { INTERNAL_TYPES, PUBLIC_TYPES, REVERT_TYPE } from '../lib/conventionalCommits.ts'
import { findPackageJsonFiles, isIndependentlyVersionedPackage } from '../lib/filesUtils.ts'
import { validatePrTitle } from '../check-pr-title.ts'

const rootPackage = releasePleaseConfig.packages['.']
const jsCorePackage = releasePleaseConfig.packages['packages/js-core']

describe('release-please config', () => {
  it('bumps every package.json on the Browser SDK version', () => {
    const sharedVersionFiles = findPackageJsonFiles()
      .filter(({ relativePath, content }) => relativePath !== 'package.json' && content.version !== undefined)
      .filter(({ content }) => !isIndependentlyVersionedPackage(content.name))
      .map(({ relativePath }) => relativePath)
      .sort()

    assert.deepEqual(rootPackage['extra-files'].map(({ path }) => path).sort(), sharedVersionFiles)
    for (const extraFile of rootPackage['extra-files']) {
      assert.deepEqual(extraFile, { type: 'json', path: extraFile.path, jsonpath: '$.version' })
    }
  })

  it('releases @datadog/js-core as its own component', () => {
    assert.equal(isIndependentlyVersionedPackage(jsCorePackageJson.name), true)
    assert.equal(jsCorePackage.component, 'js-core')
  })

  it('releases a grouped release pull request that only contains the Browser SDK', async () => {
    // The grouped release branch has no component. Without `package-name: ""`, release-please
    // compares it with the root package.json name and creates no release (strategies/base.js
    // `buildRelease`), which then blocks every next release pull request.
    const body = new PullRequestBody(
      [{ component: '', version: Version.parse('7.18.0'), notes: '### Features\n\n* **rum:** Add X' }],
      { useComponents: true }
    ).toString()
    const strategy = new Node({
      github: { repository: { owner: 'DataDog', repo: 'browser-sdk', defaultBranch: 'main' } } as GitHub,
      targetBranch: 'main',
      path: '.',
      packageName: rootPackage['package-name'],
      includeComponentInTag: rootPackage['include-component-in-tag'],
    })

    const release = await strategy.buildRelease(
      {
        headBranchName: 'release-please--branches--main',
        baseBranchName: 'main',
        // eslint-disable-next-line id-denylist -- field name of release-please's PullRequest type
        number: 5300,
        title: 'chore(release): v7.18.0',
        body,
        labels: ['autorelease: pending'],
        files: [],
        sha: 'f'.repeat(40),
      },
      { groupPullRequestTitlePattern: releasePleaseConfig['group-pull-request-title-pattern'] }
    )

    assert.equal(release?.tag.toString(), 'v7.18.0')
  })

  it('has a manifest matching the package versions', () => {
    assert.deepEqual(releasePleaseManifest, {
      '.': rootPackageJson.version,
      'packages/js-core': jsCorePackageJson.version,
    })
  })

  it('has a changelog section for each PR title type', () => {
    const visibleSections = releasePleaseConfig['changelog-sections'].filter((section) => !('hidden' in section))
    const expectedSections = [
      ...PUBLIC_TYPES.map(({ type }) => ({ type, internal: false })),
      ...INTERNAL_TYPES.map(({ type }) => ({ type, internal: true })),
      { type: REVERT_TYPE.type, internal: false },
    ]

    assert.deepEqual(visibleSections.map(({ type }) => type).sort(), expectedSections.map(({ type }) => type).sort())
    for (const { type, internal } of expectedSections) {
      const { section } = visibleSections.find((visibleSection) => visibleSection.type === type)!
      assert.equal(section === 'Internal Changes', internal, `unexpected section "${section}" for ${type}`)
    }
  })

  it('only hides types that PR titles cannot use', () => {
    const hiddenTypes = releasePleaseConfig['changelog-sections']
      .filter((section) => 'hidden' in section && section.hidden)
      .map(({ type }) => type)

    assert.deepEqual(hiddenTypes, ['staging'])
    assert.notDeepEqual(validatePrTitle('staging(ci): Bump staging to staging-47'), [])
  })

  it('titles release pull requests in a format accepted by the PR title lint', () => {
    // eslint-disable-next-line no-template-curly-in-string -- release-please placeholder, not a template
    const title = releasePleaseConfig['group-pull-request-title-pattern'].replace('${version}', '7.18.0')
    assert.deepEqual(validatePrTitle(title), [])
  })

  it('creates release tags and draft releases', () => {
    assert.equal(releasePleaseConfig.draft, true)
    assert.equal(releasePleaseConfig['force-tag-creation'], true)
    assert.match(releasePleaseConfig['last-release-sha'], /^[0-9a-f]{40}$/)
  })
})
