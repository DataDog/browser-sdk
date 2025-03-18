import * as path from 'path'

const ROOT = path.join(__dirname, '../../../..')

export function getSdkBundlePath(packageName: string, originalUrl: string) {
  return path.join(ROOT, `packages/${packageName}/bundle${originalUrl}`)
}

export function getTestAppBundlePath(appName: string, originalUrl: string) {
  return path.join(ROOT, `test/${appName}/dist${originalUrl}`)
}
