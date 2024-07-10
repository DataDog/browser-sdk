import { useEffect } from 'react'
import type { NetRequestRulesOptions } from '../../common/extension.types'
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
        blockIntakeRequests,
        useDevBundles,
        useRumSlim,
        tabId: chrome.devtools.inspectedWindow.tabId,
      },
    })
  }, [blockIntakeRequests, useDevBundles, useRumSlim])
}
