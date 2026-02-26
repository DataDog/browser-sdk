import type { TimeStamp } from '@datadog/browser-core'
import { DISCARDED, ErrorSource, HookNames, noop } from '@datadog/browser-core'
import type { LogsEvent } from '../../logsEvent.types'
import type { CommonContext } from '../../rawLogsEvent.types'
import type { LogsConfiguration } from '../configuration'
import { validateAndBuildLogsConfiguration } from '../configuration'
import { createHooks } from '../hooks'
import { StatusType } from '../logger/isAuthorized'
import { startRUMInternalContext } from '../contexts/rumInternalContext'
import { createAssemblyDecoratorFactory } from './assemblyDecoratorFactory'
import type { LogsObservation } from './logsPipelineEvents'

const INIT_CONFIGURATION = { clientToken: 'xxx', service: 'service', env: 'test', version: '1.0.0' }

const DEFAULT_RAW_LOG = {
  date: 123456 as TimeStamp,
  message: 'test message',
  status: StatusType.info,
  origin: ErrorSource.LOGGER,
}

const COMMON_CONTEXT: CommonContext = {
  view: {
    referrer: 'referrer_from_common_context',
    url: 'url_from_common_context',
  },
}

function makeObservation(overrides: Partial<LogsObservation['data']> = {}): LogsObservation {
  return {
    type: 'log',
    startTime: 0 as any,
    data: {
      rawLogsEvent: DEFAULT_RAW_LOG,
      ...overrides,
    },
  }
}

function runDecorator(
  observation: LogsObservation,
  configOverrides: Partial<LogsConfiguration> = {},
  getCommonContext: () => CommonContext = () => COMMON_CONTEXT,
  hookSetup?: (hooks: ReturnType<typeof createHooks>) => void
) {
  const hooks = createHooks()
  startRUMInternalContext(hooks)
  if (hookSetup) {
    hookSetup(hooks)
  }

  const configuration = {
    ...validateAndBuildLogsConfiguration(INIT_CONFIGURATION)!,
    ...configOverrides,
  }

  const factory = createAssemblyDecoratorFactory(configuration, hooks, getCommonContext, noop)
  const decorator = factory.create({})
  return decorator.decorate(observation, {})
}

describe('createAssemblyDecoratorFactory', () => {
  describe('consent handling', () => {
    it('should discard when hooks return DISCARDED (consent not granted)', async () => {
      const result = await runDecorator(makeObservation(), {}, () => COMMON_CONTEXT, (hooks) => {
        hooks.register(HookNames.Assemble, () => DISCARDED)
      })

      expect(result.status).toBe('discarded')
    })

    it('should contribute when hooks return attributes (consent granted)', async () => {
      const result = await runDecorator(makeObservation(), {}, () => COMMON_CONTEXT, (hooks) => {
        hooks.register(HookNames.Assemble, () => ({ service: 'from-hook' }))
      })

      expect(result.status).toBe('contributed')
    })
  })

  describe('beforeSend', () => {
    it('should discard when beforeSend returns false', async () => {
      const result = await runDecorator(makeObservation(), {
        beforeSend: () => false,
      })

      expect(result.status).toBe('discarded')
    })

    it('should contribute when beforeSend returns true', async () => {
      const result = await runDecorator(makeObservation(), {
        beforeSend: () => true,
      })

      expect(result.status).toBe('contributed')
    })

    it('should contribute when beforeSend returns undefined', async () => {
      const result = await runDecorator(makeObservation(), {
        beforeSend: () => undefined,
      })

      expect(result.status).toBe('contributed')
    })

    it('should not apply beforeSend discard to agent logs', async () => {
      const agentObservation = makeObservation({
        rawLogsEvent: { ...DEFAULT_RAW_LOG, origin: ErrorSource.AGENT, status: StatusType.error },
      })

      const result = await runDecorator(agentObservation, {
        beforeSend: () => false,
      })

      expect(result.status).toBe('contributed')
    })
  })

  describe('field assembly', () => {
    it('should include common context view', async () => {
      const result = await runDecorator(makeObservation())

      expect(result.status).toBe('contributed')
      if (result.status === 'contributed') {
        expect(result.attributes.assembledLog.view).toEqual(COMMON_CONTEXT.view!)
      }
    })

    it('should use savedCommonContext when provided instead of getCommonContext', async () => {
      const savedCommonContext: CommonContext = {
        view: { referrer: 'referrer_from_saved', url: 'url_from_saved' },
      }
      const getCommonContextSpy = jasmine.createSpy('getCommonContext').and.returnValue(COMMON_CONTEXT)

      const result = await runDecorator(
        makeObservation({ savedCommonContext }),
        {},
        getCommonContextSpy
      )

      expect(result.status).toBe('contributed')
      expect(getCommonContextSpy).not.toHaveBeenCalled()
      if (result.status === 'contributed') {
        expect(result.attributes.assembledLog.view).toEqual(savedCommonContext.view!)
      }
    })

    it('should fall back to getCommonContext when savedCommonContext is not provided', async () => {
      const getCommonContextSpy = jasmine.createSpy('getCommonContext').and.returnValue(COMMON_CONTEXT)

      const result = await runDecorator(makeObservation(), {}, getCommonContextSpy)

      expect(result.status).toBe('contributed')
      expect(getCommonContextSpy).toHaveBeenCalled()
    })

    it('should merge raw log event fields into assembled log', async () => {
      const result = await runDecorator(makeObservation())

      expect(result.status).toBe('contributed')
      if (result.status === 'contributed') {
        expect(result.attributes.assembledLog.message).toBe('test message')
        expect(result.attributes.assembledLog.status).toBe(StatusType.info)
        expect(result.attributes.assembledLog.origin).toBe(ErrorSource.LOGGER)
      }
    })

    it('should merge message context into assembled log', async () => {
      const result = await runDecorator(
        makeObservation({ messageContext: { foo: 'from-message-context' } as any })
      )

      expect(result.status).toBe('contributed')
      if (result.status === 'contributed') {
        expect((result.attributes.assembledLog as any).foo).toBe('from-message-context')
      }
    })

    it('should include default ddtags', async () => {
      const result = await runDecorator(makeObservation())

      expect(result.status).toBe('contributed')
      if (result.status === 'contributed') {
        expect(result.attributes.assembledLog.ddtags).toContain('sdk_version:')
        expect(result.attributes.assembledLog.ddtags).toContain('env:test')
        expect(result.attributes.assembledLog.ddtags).toContain('service:service')
        expect(result.attributes.assembledLog.ddtags).toContain('version:1.0.0')
      }
    })

    it('should append custom ddtags', async () => {
      const result = await runDecorator(makeObservation({ ddtags: ['custom:tag'] }))

      expect(result.status).toBe('contributed')
      if (result.status === 'contributed') {
        expect(result.attributes.assembledLog.ddtags).toContain('custom:tag')
      }
    })

    it('should allow beforeSend to modify fields', async () => {
      const result = await runDecorator(makeObservation(), {
        beforeSend: (event: LogsEvent) => {
          event.message = 'modified by beforeSend'
        },
      })

      expect(result.status).toBe('contributed')
      if (result.status === 'contributed') {
        expect(result.attributes.assembledLog.message).toBe('modified by beforeSend')
      }
    })
  })
})
