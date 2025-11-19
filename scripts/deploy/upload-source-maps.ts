import path from 'node:path'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { getBuildEnvValue } from '../lib/buildEnv.ts'
import { getTelemetryOrgApiKey } from '../lib/secrets.ts'
import { siteByDatacenter } from '../lib/datacenter.ts'
import { forEachFile } from '../lib/filesUtils.ts'
import { buildRootUploadPath, buildDatacenterUploadPath, buildBundleFolder, packages } from './lib/deploymentUtils.ts'

/**
 * Upload source maps to datadog
 * Usage:
 * BUILD_MODE=canary|release node upload-source-maps.ts staging|canary|vXXX root,us1,eu1,...
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

if (!process.env.NODE_TEST_CONTEXT) {
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
      sites = [siteByDatacenter[uploadPathType]]
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
  await forEachFile(bundleFolder, (bundlePath: string) => {
    const uploadPath = buildRootUploadPath(bundlePath, version)

    if (bundlePath === uploadPath) {
      return
    }

    console.log(`Renaming ${bundlePath} to ${uploadPath}`)
    command`mv ${bundlePath} ${uploadPath}`.run()
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
    const apiKey = getTelemetryOrgApiKey(site)

    if (!apiKey) {
      printLog(`No API key configured for ${site}, skipping...`)
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
        DATADOG_API_KEY: apiKey,
        DATADOG_SITE: site,
      })
      .run()
  }
}
