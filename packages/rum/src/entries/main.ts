// Keep the following in sync with packages/rum-slim/src/entries/main.ts
import { defineGlobal, getGlobalObject } from '@flashcatcloud/browser-core'
import type { RumPublicApi } from '@flashcatcloud/browser-rum-core'
import { makeRumPublicApi, startRum } from '@flashcatcloud/browser-rum-core'
import { makeRecorderApi } from '../boot/recorderApi'
import { createDeflateEncoder, startDeflateWorker } from '../domain/deflate'
import { lazyLoadRecorder } from '../boot/lazyLoadRecorder'
export type {
  CommonProperties,
  RumPublicApi as RumGlobal,
  RumInitConfiguration,
  // Events
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
  RumVitalEvent,
  // Events context
  RumEventDomainContext,
  RumViewEventDomainContext,
  RumErrorEventDomainContext,
  RumActionEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@flashcatcloud/browser-rum-core'
export { DefaultPrivacyLevel } from '@flashcatcloud/browser-core'

const recorderApi = makeRecorderApi(lazyLoadRecorder)

export const flashcatRum = makeRumPublicApi(startRum, recorderApi, { startDeflateWorker, createDeflateEncoder })

interface BrowserWindow extends Window {
  FC_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'FC_RUM', flashcatRum)
