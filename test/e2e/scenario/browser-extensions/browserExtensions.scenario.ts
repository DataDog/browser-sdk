import path from 'path'
import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

const pathToBundleExtension = path.join(__dirname, '../../../../test/apps/base-extension')
const pathToCdnExtension = path.join(__dirname, '../../../../test/apps/cdn-extension')

// TODO: the recorder is lazy loaded and does not works in an browser extension content script
const DISABLE_SESSION_REPLAY_CONFIGURATION = { sessionReplaySampleRate: 0 }

interface Ext {
  name: string
  path: string
}

const EXTENSIONS: Ext[] = [
  { name: 'bundle', path: pathToBundleExtension },
  { name: 'cdn', path: pathToCdnExtension },
]

function declareExtensionTests(ext: Ext) {
  const warningMessage =
    'Datadog Browser SDK: Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
  const errorMessage = 'Datadog Browser SDK: SDK initialized on a non-allowed domain.'

  createTest(`[${ext.name}] SDK is initialized in an unsupported environment and warns`)
    .withExtension(ext.path)
    .withRum({ ...DISABLE_SESSION_REPLAY_CONFIGURATION })
    .run(async ({ withBrowserLogs, flushEvents }) => {
      await flushEvents()
      withBrowserLogs((logs) => {
        expect(logs).toContainEqual(expect.objectContaining({ level: 'warning', message: warningMessage }))
      })
    })

  createTest(`[${ext.name}] allowedTrackingOrigins accepted`)
    .withExtension(ext.path)
    .withRum({ allowedTrackingOrigins: ['LOCATION_ORIGIN'], ...DISABLE_SESSION_REPLAY_CONFIGURATION })
    .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
      await flushEvents()
      expect(intakeRegistry.rumViewEvents).toHaveLength(1)
      withBrowserLogs((logs) => expect(logs.length).toBe(0))
    })

  createTest(`[${ext.name}] allowedTrackingOrigins rejected`)
    .withExtension(ext.path)
    .withRum({ allowedTrackingOrigins: ['https://app.example.com'], ...DISABLE_SESSION_REPLAY_CONFIGURATION })
    .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
      await flushEvents()
      expect(intakeRegistry.rumViewEvents).toHaveLength(0)
      withBrowserLogs((logs) => {
        expect(logs).toContainEqual(expect.objectContaining({ level: 'error', message: errorMessage }))
      })
    })
}

test.describe('browser extensions', () => {
  for (const ext of EXTENSIONS) {
    test.describe(ext.name, () => declareExtensionTests(ext))
  }
})
