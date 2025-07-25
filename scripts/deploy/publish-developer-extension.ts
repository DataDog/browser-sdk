// chrome-webstore-upload only support ESM syntax.
const webstore = (options: any) => import('chrome-webstore-upload').then(({ default: webstore }) => webstore(options))
import * as fs from 'node:fs'

import { printLog, runMain } from '../lib/executionUtils'
import { command } from '../lib/command'
import { getChromeWebStoreClientId, getChromeWebStoreClientSecret, getChromeWebStoreRefreshToken } from '../lib/secrets'

const ZIP_FILE_NAME = 'developer-extension.zip'

runMain(async () => {
  printLog('Building the project')
  command`yarn build`.withEnvironment({ BUILD_MODE: 'release' }).run()

  printLog('Zipping extension files')
  command`zip -jr ${ZIP_FILE_NAME} developer-extension/dist/`.run()

  printLog('Publish Developer extension')
  await uploadAndPublish()

  printLog('Developer extension published.')
})

async function uploadAndPublish(): Promise<void> {
  const zipFile = fs.createReadStream(ZIP_FILE_NAME)
  const api = await webstore({
    extensionId: 'boceobohkgenpcpogecpjlnmnfbdigda',
    clientId: getChromeWebStoreClientId(),
    clientSecret: getChromeWebStoreClientSecret(),
    refreshToken: getChromeWebStoreRefreshToken(),
  })

  try {
    printLog('Fetching the token')
    const token = await api.fetchToken()

    printLog('Uploading the archive')
    await api.uploadExisting(zipFile, token)

    printLog('Publishing')
    await api.publish()
  } catch (err: any) {
    const body = err?.response?.body
    if (body) {
      throw body
    }
    throw err
  }
}
