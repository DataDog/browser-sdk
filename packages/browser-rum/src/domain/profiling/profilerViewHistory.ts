import { globalObject, mockable } from '@datadog/js-core/util'
import { createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { LifeCycle, ViewHistory, ViewHistoryEntry } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { RumViewEntry } from '../../types'

export function createProfilerViewHistory(lifeCycle: LifeCycle, viewHistory: ViewHistory) {
  const history = createValueHistory<RumViewEntry>({ expireDelay: SESSION_TIME_OUT_DELAY })
  const initialView = viewHistory.findView()
  if (initialView) {
    addView(initialView)
  }

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, addView)
  lifeCycle.subscribe(LifeCycleEventType.AFTER_VIEW_ENDED, ({ endClocks }) => {
    history.closeActive(endClocks.relative)
  })

  function addView(view: ViewHistoryEntry) {
    history.add(
      {
        viewId: view.id,
        viewName: getCustomOrDefaultViewName(view.name, mockable(globalObject.location).pathname),
        startClocks: view.startClocks,
      },
      view.startClocks.relative
    )
  }

  return history
}

export const getCustomOrDefaultViewName = (customViewName: string | undefined, viewPathUrl: string): string =>
  customViewName || getDefaultViewName(viewPathUrl)

// This is the regex used to extract the path from the url (from SimpleUrlGroupingProcessor.java)
// It's a bit different from the one in the java code because we removed the lookbehind unsupported by Safari.
const PATH_MIXED_ALPHANUMERICS = /\/(?![vV]\d{1,2}\/)([^/\d?]*\d+[^/?]*)/g

export function getDefaultViewName(viewPathUrl: string): string {
  if (!viewPathUrl) {
    return '/'
  }

  // Replace all the mixed alphanumerics with a ?
  return viewPathUrl.replace(PATH_MIXED_ALPHANUMERICS, '/?')
}
