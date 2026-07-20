import { describe, it, expect, vi } from 'vitest'
import { createDisplay, originalConsoleMethods } from '@datadog/js-core/util'
import { DEBUGGER_DISPLAY_PREFIX } from './display'

describe('debugger display', () => {
  it('should use the debugger SDK prefix', () => {
    const warnSpy = vi.spyOn(originalConsoleMethods, 'warn').mockImplementation(() => undefined)

    createDisplay(DEBUGGER_DISPLAY_PREFIX).warn('message')

    expect(warnSpy).toHaveBeenCalledWith('Datadog Debugger SDK:', 'message')
  })
})
