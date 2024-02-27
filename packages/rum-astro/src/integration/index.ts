/* eslint-disable local-rules/disallow-side-effects */
import * as fs from 'fs'
import * as path from 'path'
import type { AstroIntegration } from 'astro'

import { buildBrowserSnippet } from './snippet'
import type { DatadogRumOptions } from './types'

const PKG_NAME = '@datadog/browser-rum-astro'

export const datadogRumAstro = (options: DatadogRumOptions): AstroIntegration => ({
  name: PKG_NAME,
  hooks: {
    'astro:config:setup': ({ injectScript, logger }) => {
      const sdkEnabled = options.enabled ?? true
      if (!sdkEnabled) {
        return
      }

      const pathToClientInit = options.clientConfigPath
        ? path.resolve(options.clientConfigPath)
        : findDefaultSdkInitFile()

      let configFileOptions = {}
      if (pathToClientInit) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        configFileOptions = JSON.parse(fs.readFileSync(pathToClientInit, { encoding: 'utf-8' }))
        options.debug && logger.info(`Using ${pathToClientInit} for client init: ${JSON.stringify(configFileOptions)}`)
      }
      const sdkOptions = Object.assign({}, configFileOptions, options, {
        applicationId: process.env.DD_RUM_APPLICATION_ID,
        clientToken: process.env.DD_RUM_CLIENT_TOKEN,
      })
      options.debug && logger.info(`Using options for client init: ${JSON.stringify(sdkOptions)}`)
      injectScript('page', buildBrowserSnippet(sdkOptions))
    },
  },
})

const possibleFileExtensions = ['json']

function findDefaultSdkInitFile(): string | undefined {
  const cwd = process.cwd()
  return possibleFileExtensions
    .map((e) => path.resolve(path.join(cwd, `datadog.rum.config.${e}`)))
    .find((filename) => fs.existsSync(filename))
}
