import { parseArgs } from 'node:util'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { releaseVersion } from '../lib/browserSdkVersion.ts'
import { isSemanticVersion } from '../lib/filesUtils.ts'

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main())
}

const RETRY_HINT = 'then retry step-6: versions already on npm are skipped.'

/**
 * Publishes the public packages to npm. It is meant to run in the `publish-npm.yml` GitHub
 * workflow.
 *
 * Authentication: without `NPM_TOKEN`, yarn falls back to npm OIDC trusted publishing (which needs
 * `id-token: write`). `NPM_TOKEN` is only an escape hatch, for example to publish a package that
 * is not on npm yet and so can't have a trusted publisher.
 */
export function main(args = process.argv.slice(2)): void {
  const {
    values: { 'dry-run': dryRun },
  } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean', default: false },
    },
  })

  // Packages are always published with the `latest` dist-tag, so never publish a prerelease
  if (!dryRun && !isSemanticVersion(releaseVersion)) {
    throw new Error(`Refusing to publish version "${releaseVersion}": it is not a plain X.Y.Z version.`)
  }

  printLog('Building')
  // Usually we don't need to build packages before publishing them, because yarn will call each
  // `prepack` script to build packages during "yarn npm publish".
  //
  // But when things go wrong and some packages fail to be published, and we want to retry the job,
  // yarn will skip already published packages (--tolerate-republish) so if any unpublished package
  // depends on an already published one for their build, the build will fail.
  command`yarn build`.withEnvironment({ BUILD_MODE: 'release' }).run()

  const npmToken = process.env.NPM_TOKEN
  const useToken = Boolean(npmToken)
  // Provenance needs a CI provider that can sign it, yarn rejects the flag anywhere else
  const withProvenance = process.env.GITHUB_ACTIONS === 'true'

  printLog(
    `${dryRun ? 'Publishing (dry run)' : 'Publishing'} with ${useToken ? 'the NPM_TOKEN secret' : 'OIDC trusted publishing'}`
  )

  const flags = [...(withProvenance ? ['--provenance'] : []), ...(dryRun ? ['--dry-run'] : [])]

  try {
    command`yarn workspaces foreach --verbose --all --topological --no-private npm publish --tolerate-republish --access public ${flags}`
      .withEnvironment({
        ...(npmToken ? { YARN_NPM_AUTH_TOKEN: npmToken } : {}),
        BUILD_MODE: 'release',
      })
      .withLogs()
      .run()
  } catch (error) {
    const hint = useToken
      ? `Check the NPM_TOKEN secret of the npm-publish environment, ${RETRY_HINT}`
      : "Check the package's trusted publisher on npmjs.com (DataDog/browser-sdk, publish-npm.yml, environment " +
        'npm-publish). A package not on npm yet needs a temporary NPM_TOKEN secret on the npm-publish ' +
        `environment. Fix it, ${RETRY_HINT}`
    throw new Error(`NPM publish failed. ${hint}`, { cause: error as Error })
  }
}
