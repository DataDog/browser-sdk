import type { Context, User } from '@datadog/browser-core'
import { addEventListener, display, setTimeout } from '@datadog/browser-core'
import type { RumPublicApi } from '../../boot/rumPublicApi'
import { LifeCycleEventType, type LifeCycle } from '../lifeCycle'
import { RumEventType } from '../../rawRumEvent.types'
import type { VocConfig } from './trigger'
import { initTriggers } from './trigger'

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}

export function startSurveyCollection(lifeCycle: LifeCycle) {
  display.log('Starting survey collection')
  const { getByAction, getByUserEmail } = initTriggers()
  const triggeredSurveys = new Set<VocConfig>()

  function openSurveys(triggers: VocConfig[]) {
    for (const trigger of triggers) {
      if (!triggeredSurveys.has(trigger)) {
        openSurvey(trigger, savedSurvey)
        triggeredSurveys.add(trigger)
      }
    }
  }

  function savedSurvey(payload: Context) {
    ;(window as BrowserWindow).DD_RUM?.addAction('voc-answered', payload)
  }

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => {
    if (event.rawRumEvent.type !== RumEventType.ACTION) {
      return
    }

    openSurveys(getByAction(event.rawRumEvent.action.target.name))
  })

  return {
    setUser: (user: User) => {
      if (user.email) {
        openSurveys(getByUserEmail(user.email))
      }
    },
  }
}

function openSurvey(vocConfig: VocConfig, onSavedSurvey: (payload: any) => void) {
  display.log('openSurvey', vocConfig)

  const iframe = createIframe()
  iframe.src = `https://localhost:8443/static-apps/voice-of-customer/?vocConfig=${encodeURIComponent(JSON.stringify(vocConfig))}`
  // iframe.src = `https://voice-of-customer-676e09666aefef944418bb3f8d752453.static-app.us1.staging.dog?vocConfig=${encodeURIComponent(JSON.stringify(vocConfig))}`
  document.body.appendChild(iframe)

  // Add listener for close message from the iframe
  addEventListener({ allowUntrustedEvents: true }, window, 'message', (event) => {
    switch (event.data?.type) {
      case 'dd-rum-close-survey':
        closeIframe(iframe)
        break
      case 'dd-rum-open-survey':
        const { width, height } = event.data.payload
        display.log('Open survey:', event)
        // iframe.style.width = `${width}px`
        // iframe.style.height = `${height}px`
        // showIframe(iframe, 0)
        break
      case 'dd-rum-survey-response':
        display.log('Survey response:', event.data.payload)
        onSavedSurvey(event.data.payload)
        closeIframe(iframe)
        break
      case 'iframe-resize': {
        const { width, height } = event.data.payload
        if (width > 0 && height > 0) {
          iframe.style.width = `${width}px`
          iframe.style.height = `${height}px`
          showIframe(iframe, 1)
        }
        break
      }
    }
  })
}

function closeIframe(iframe: HTMLIFrameElement) {
  if (!iframe) {
    return
  }
  iframe.style.opacity = '0'
  iframe.style.transform = 'translateX(320px)'

  addEventListener(
    { allowUntrustedEvents: true },
    iframe,
    'transitionend',
    () => {
      iframe.remove()
    },
    { once: true }
  )
}

function showIframe(iframe: HTMLIFrameElement, opacity: number) {
  display.log('iframe', iframe)
  if (!iframe) {
    display.warn('Iframe not initialized. Call injectIframe() first.')
    return
  }
  iframe.style.display = 'block'
  setTimeout(() => {
    iframe.style.opacity = '1'
  }, 0)
}

function createIframe() {
  const iframe = document.createElement('iframe')
  iframe.id = 'dd-rum-iframe'
  Object.assign(iframe.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '300px',
    height: '292px',
    border: 'none',
    display: 'block',
    opacity: '0',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    transition: 'opacity 0.3s ease, transform 0.5s ease',
    borderRadius: '10px',
    zIndex: '10000',
  })

  return iframe
}
