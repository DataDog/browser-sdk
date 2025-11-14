import type { LogsEvent } from '@datadog/browser-logs'
import type { RumEvent } from '../../../../packages/rum-core/src/rumEvent.types'

export const RUM_BEACON_EVENT = {
  type: 'resource',
  resource: {
    type: 'beacon',
    status: 200,
  },
  date: Date.now(),
  application: { id: 'test-app' },
} as unknown as RumEvent

export const RUM_ACTION_EVENT = {
  type: 'action',
  action: {
    name: 'Test action',
    type: 'click',
  },
} as unknown as RumEvent

export const RUM_ERROR_EVENT = {
  type: 'error',
  error: {
    message: 'Test error',
    source: 'console',
  },
  date: Date.now(),
  application: { id: 'test-app' },
} as unknown as RumEvent

export const RUM_XHR_RESOURCE_EVENT = {
  type: 'resource',
  resource: {
    type: 'xhr',
    status: 200,
    url: 'http://test.com/api',
  },
  date: Date.now(),
  application: { id: 'test-app' },
} as unknown as RumEvent

export const LOGS_EVENT = {
  status: 'info',
  origin: 'logger',
} as unknown as LogsEvent
