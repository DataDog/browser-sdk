import { useEffect } from 'react'
import type { NetRequestRulesOptions } from '../../common/types'
import { sendMessageToBackground } from '../backgroundScriptConnection'

export function useNetworkRules({
  blockIntakeRequests,
  useDevBundles,
  useRumSlim,
}: Omit<NetRequestRulesOptions, 'tabId'>) {
  useEffect(() => {
    sendMessageToBackground({
      type: 'update-net-request-rules',
      options: {
        tabId: chrome.devtools.inspectedWindow.tabId,
        useDevBundles,
        useRumSlim,
        blockIntakeRequests,
      },
    })
  }, [blockIntakeRequests, useDevBundles, useRumSlim])
}
