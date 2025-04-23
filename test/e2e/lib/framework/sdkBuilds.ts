import * as path from 'path'

const ROOT = path.join(__dirname, '../../../..')

export function getSdkBundlePath(packageName: string, originalUrl: string) {
  return path.join(ROOT, `packages/${packageName}/bundle${originalUrl}`)
}

export function getTestAppBundlePath(appName: string, originalUrl: string) {
  const appNameMapping: Record<string, string> = {
    app: 'apps/vanilla',
    'react-app': 'apps/react',
  }

  const targetAppPath = appNameMapping[appName] || appName
  return path.join(ROOT, `test/${targetAppPath}/dist${originalUrl}`)
}
