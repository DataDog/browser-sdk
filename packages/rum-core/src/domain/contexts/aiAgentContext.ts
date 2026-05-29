import { getInitCookie, HookNames, isSyntheticsTest, mockable, SKIPPED } from '@datadog/browser-core'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'

export const AI_AGENT_COOKIE_NAME = 'datadog-ai-agent-id'

export interface AiAgentWindow extends Window {
  _DATADOG_AI_AGENT?: unknown
  __playwright__binding__?: unknown
  __pwInitScripts?: unknown
  __puppeteer_evaluation_script__?: unknown
  _selenium?: unknown
  _Selenium_IDE_Recorder?: unknown
}

export interface AiAgentContext {
  name?: string
  detection_method: string
  framework?: string
  behavioral_detection_reason?: string
}

const AI_AGENT_UA_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /ClaudeBot/i, name: 'claudebot' },
  { pattern: /Claude-User/i, name: 'claude' },
  { pattern: /Claude-SearchBot/i, name: 'claude-searchbot' },
  { pattern: /GPTBot/i, name: 'gptbot' },
  { pattern: /ChatGPT-User/i, name: 'chatgpt' },
  { pattern: /OAI-SearchBot/i, name: 'oai-searchbot' },
  { pattern: /PerplexityBot/i, name: 'perplexity' },
  { pattern: /Perplexity-User/i, name: 'perplexity' },
  { pattern: /Google-Extended/i, name: 'google-extended' },
  { pattern: /Gemini-Deep-Research/i, name: 'gemini' },
  { pattern: /meta-externalagent/i, name: 'meta' },
  { pattern: /Bytespider/i, name: 'bytespider' },
  { pattern: /Amazonbot/i, name: 'amazonbot' },
  { pattern: /cohere-ai/i, name: 'cohere' },
  { pattern: /Diffbot/i, name: 'diffbot' },
  { pattern: /AI2Bot/i, name: 'ai2bot' },
  { pattern: /Applebot-Extended/i, name: 'applebot' },
]

const SOFTWARE_RENDERER_PATTERNS = [/swiftshader/i, /llvmpipe/i, /softpipe/i]

export function startAiAgentContext(hooks: Hooks) {
  const staticDetection = detectAiAgent()
  let behavioralDetection: AiAgentContext | undefined

  hooks.register(HookNames.Assemble, ({ eventType }): DefaultRumEventAttributes | SKIPPED => {
    const aiAgentContext = staticDetection ?? behavioralDetection
    if (!aiAgentContext) {
      return SKIPPED
    }

    return {
      type: eventType,
      context: {
        isAgentSession: true,
        aiAgentContext,
      },
    }
  })

  return {
    updateBehavioralDetection(context: AiAgentContext) {
      if (!staticDetection) {
        behavioralDetection = context
      }
    },
  }
}

export function detectAiAgent(): AiAgentContext | undefined {
  if (isSyntheticsTest()) {
    return undefined
  }

  return (
    // Tier 1: zero false positives
    detectCooperativeGlobal() ??
    detectCooperativeCookie() ??
    detectWebdriver() ??
    detectAiAgentUserAgent() ??
    detectAutomationFramework() ??
    // Tier 2: low false positives
    mockable(detectSoftwareRenderer)() ??
    mockable(detectHeadlessEnvironment)() ??
    mockable(detectCDP)()
  )
}

function detectCooperativeGlobal(): AiAgentContext | undefined {
  const globalContext = (window as AiAgentWindow)._DATADOG_AI_AGENT
  if (
    typeof globalContext === 'object' &&
    globalContext !== null &&
    typeof (globalContext as { name?: unknown }).name === 'string'
  ) {
    return { name: (globalContext as { name: string }).name, detection_method: 'cooperative' }
  }
}

function detectCooperativeCookie(): AiAgentContext | undefined {
  const cookieValue = getInitCookie(AI_AGENT_COOKIE_NAME)
  if (typeof cookieValue === 'string' && cookieValue.length > 0) {
    return { name: cookieValue, detection_method: 'cooperative' }
  }
}

function detectWebdriver(): AiAgentContext | undefined {
  if (navigator.webdriver === true) {
    return { detection_method: 'webdriver' }
  }
}

function detectAiAgentUserAgent(): AiAgentContext | undefined {
  const userAgent = navigator.userAgent
  for (const { pattern, name } of AI_AGENT_UA_PATTERNS) {
    if (pattern.test(userAgent)) {
      return { name, detection_method: 'ua_match' }
    }
  }
}

function detectAutomationFramework(): AiAgentContext | undefined {
  const win = window as AiAgentWindow
  if ('__playwright__binding__' in win || '__pwInitScripts' in win) {
    return { detection_method: 'automation_framework', framework: 'playwright' }
  }
  if ('__puppeteer_evaluation_script__' in win) {
    return { detection_method: 'automation_framework', framework: 'puppeteer' }
  }
  if ('_selenium' in win || '_Selenium_IDE_Recorder' in win) {
    return { detection_method: 'automation_framework', framework: 'selenium' }
  }
}

export function detectSoftwareRenderer(): AiAgentContext | undefined {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl')
    if (!gl) {
      return undefined
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (!debugInfo) {
      return undefined
    }
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    if (typeof renderer === 'string' && SOFTWARE_RENDERER_PATTERNS.some((pattern) => pattern.test(renderer))) {
      return { detection_method: 'webgl_renderer' }
    }
  } catch {
    // WebGL not available
  }
  return undefined
}

export function detectHeadlessEnvironment(): AiAgentContext | undefined {
  if (window.outerHeight === 0 && window.outerWidth === 0) {
    return { detection_method: 'headless_environment' }
  }
  if (typeof navigator.languages === 'object' && navigator.languages.length === 0) {
    return { detection_method: 'headless_environment' }
  }
  return undefined
}

// CDP Runtime.enable causes Chrome to enumerate console method arguments during
// serialization. A Proxy trap detects this enumeration, revealing an active CDP
// connection. Note: also triggers when DevTools is open (acceptable for Tier 2).
export function detectCDP(): AiAgentContext | undefined {
  if (typeof Proxy === 'undefined') {
    return undefined
  }
  let detected = false
  const obj: Record<string, unknown> = {}
  try {
    const proxy = new Proxy(obj, {
      ownKeys() {
        detected = true
        return Reflect.ownKeys(obj)
      },
    })
    // eslint-disable-next-line no-console
    console.debug(proxy)
  } catch {
    // Ignore errors
  }
  return detected ? { detection_method: 'cdp' } : undefined
}
