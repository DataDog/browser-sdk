import * as path from 'path'
import { printLog, runMain } from '../lib/executionUtils'
import { command } from '../lib/command'
import { getBuildEnvValue } from '../lib/buildEnv'
import { getTelemetryOrgApiKey } from '../lib/secrets'
import { siteByDatacenter } from '../lib/datadogSites'
import { forEachFile } from '../lib/filesUtils'
import { buildRootUploadPath, buildDatacenterUploadPath, buildBundleFolder, packages } from './lib/deploymentUtils'

/**
 * Upload source maps to datadog
 * Usage:
 * BUILD_MODE=canary|release node upload-source-maps.js staging|canary|vXXX root,us1,eu1,...
 */

function getSitesByVersion(version: string): string[] {
  switch (version) {
    case 'staging':
      return ['datad0g.com', 'datadoghq.com']
    case 'canary':
      return ['datadoghq.com']
    default:
      return Object.values(siteByDatacenter)
  }
}

if (require.main === module) {
  const version = process.argv[2]
  const uploadPathTypes = process.argv[3].split(',')

  runMain(async () => {
    await main(version, uploadPathTypes)
  })
}

export async function main(version: string, uploadPathTypes: string[]): Promise<void> {
  for (const { packageName, service } of packages) {
    await uploadSourceMaps(packageName, service, version, uploadPathTypes)
  }
  printLog('Source maps upload done.')
}

async function uploadSourceMaps(
  packageName: string,
  service: string,
  version: string,
  uploadPathTypes: string[]
): Promise<void> {
  const bundleFolder = buildBundleFolder(packageName)

  for (const uploadPathType of uploadPathTypes) {
    let sites: string[]
    let uploadPath: string
    if (uploadPathType === 'root') {
      sites = getSitesByVersion(version)
      uploadPath = buildRootUploadPath(packageName, version)
      await renameFilesWithVersionSuffix(bundleFolder, version)
    } else {
      sites = [siteByDatacenter[uploadPathType as keyof typeof siteByDatacenter]]
      uploadPath = buildDatacenterUploadPath(uploadPathType, packageName, version)
    }
    const prefix = path.dirname(`/${uploadPath}`)
    uploadToDatadog(packageName, service, prefix, bundleFolder, sites)
  }
}

async function renameFilesWithVersionSuffix(bundleFolder: string, version: string): Promise<void> {
  // The datadog-ci CLI is taking a directory as an argument. It will scan every source map files in
  // it and upload those along with the minified bundle. The file names must match the one from the
  // CDN, thus we need to rename the bundles with the right suffix.
  await forEachFile(bundleFolder, (bundlePath) => {
    const uploadPath = buildRootUploadPath(bundlePath, version)

    if (bundlePath === uploadPath) {
      return Promise.resolve()
    }

    console.log(`Renaming ${bundlePath} to ${uploadPath}`)
    command`mv ${bundlePath} ${uploadPath}`.run()
    return Promise.resolve()
  })
}

function uploadToDatadog(
  packageName: string,
  service: string,
  prefix: string,
  bundleFolder: string,
  sites: string[]
): void {
  for (const site of sites) {
    if (!site) {
      printLog(`No source maps upload configured for ${site}, skipping...`)
      continue
    }
    printLog(`Uploading ${packageName} source maps with prefix ${prefix} for ${site}...`)

    command`
      datadog-ci sourcemaps upload ${bundleFolder}
        --service ${service}
        --release-version ${getBuildEnvValue('SDK_VERSION')}
        --minified-path-prefix ${prefix}
        --project-path @datadog/browser-${packageName}/
        --repository-url https://www.github.com/datadog/browser-sdk
    `
      .withEnvironment({
        DATADOG_API_KEY: getTelemetryOrgApiKey(site),
        DATADOG_SITE: site,
      })
      .run()
  }
}
