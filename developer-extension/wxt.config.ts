import { defineConfig } from 'wxt'
import { getBuildEnvValue } from '../scripts/lib/buildEnv'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  entrypointsDir: 'src/entrypoints',
  manifest: {
    name: 'Datadog Browser SDK developer extension',
    permissions: ['storage', 'browsingData', 'declarativeNetRequest', 'webNavigation', 'scripting'],
    host_permissions: ['<all_urls>'],
    icons: {
      '256': 'icon.png',
    },
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    devtools_page: 'devtools.html',
  },
  webExt: {
    chromiumArgs: ['--auto-open-devtools-for-tabs'],
    openDevtools: true,
    openConsole: true,
    startUrls: ['https://datadoghq.dev/browser-sdk-test-playground/?application_id=xxx&client_token=xxx'],
  },
  vite: () => ({
    build: {
      chunkSizeWarningLimit: 1000,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
        generateScopedName: '[name]_[local]_[hash:base64:5]',
      },
    },
    define: {
      __BUILD_ENV__SDK_VERSION__: JSON.stringify(getBuildEnvValue('SDK_VERSION')),
    },
  }),
})
