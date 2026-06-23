import { createDisplay, originalConsoleMethods } from '@openobserve/js-core/util'
import { DEBUGGER_DISPLAY_PREFIX } from './display'

describe('debugger display', () => {
  it('should use the debugger SDK prefix', () => {
    const warnSpy = spyOn(originalConsoleMethods, 'warn')

    createDisplay(DEBUGGER_DISPLAY_PREFIX).warn('message')

    expect(warnSpy).toHaveBeenCalledWith('Datadog Debugger SDK:', 'message')
  })
})
