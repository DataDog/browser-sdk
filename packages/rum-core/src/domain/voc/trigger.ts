import { display, getCookie } from '@datadog/browser-core'

interface VocConfigBase {
  name: string
  description: string
  type: 'free-text' | 'scale'
  triggerActionName: string
  trackedUserEmails: string[]
  excludedUserEmails?: string[]
  sampleRate?: number
}

interface VocConfigFreeText extends VocConfigBase {
  type: 'free-text'
  question: string
}

interface VocConfigScale extends VocConfigBase {
  type: 'scale'
  question: string
  range: { min: { label: string; value: number }; max: { label: string; value: number } }
}

export type VocConfig = VocConfigFreeText | VocConfigScale

export function initTriggers() {
  const triggers = getTriggers()
  return {
    getByAction: (actionName: string) => triggers.filter((trigger) => trigger.triggerActionName === actionName),
    getByUserEmail: (email: string) => triggers.filter((trigger) => trigger.trackedUserEmails.includes(email)),
  }
}

export function getTriggers(): VocConfig[] {
  const config = getCookie('_dd_s_voc')
  if (!config) {
    return []
  }

  try {
    // Decode the cookie value and parse it as JSON
    const cookieValue = decodeURIComponent(config)
    return JSON.parse(cookieValue) as VocConfig[]
  } catch (error) {
    display.error('Failed to parse cookie _dd_s_voc as JSON:', error)
    return []
  }
}
