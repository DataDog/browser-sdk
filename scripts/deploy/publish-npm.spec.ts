import assert from 'node:assert/strict'
import path from 'node:path'
import { before, beforeEach, describe, it, mock } from 'node:test'
import { mockModule } from './lib/testHelpers.ts'

interface CommandChain {
  withEnvironment: (env: Record<string, string>) => CommandChain
  withLogs: () => CommandChain
  run: () => string | undefined
}

describe('publish-npm', () => {
  const commandMock = mock.fn<(template: TemplateStringsArray, ...values: any[]) => CommandChain>()

  let main: (args?: string[]) => void
  let publishEnvironment: Record<string, string> | undefined
  let publishError: Error | undefined

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    ;({ main } = await import('./publish-npm.ts'))
  })

  beforeEach(() => {
    publishEnvironment = undefined
    publishError = undefined

    commandMock.mock.mockImplementation((template: TemplateStringsArray, ...values: any[]): CommandChain => {
      const isPublish = isNpmPublishCommand(template, ...values)
      const chain: CommandChain = {
        withEnvironment: (env) => {
          if (isPublish) {
            publishEnvironment = env
          }
          return chain
        },
        withLogs: () => chain,
        run: () => {
          if (isPublish && publishError) {
            throw publishError
          }
          return ''
        },
      }
      return chain
    })
  })

  it('should publish without an npm auth token, so that yarn uses OIDC trusted publishing', () => {
    main([])

    assert.deepEqual(publishEnvironment, { BUILD_MODE: 'release' })
  })

  it('should point to the trusted publisher settings when npm publish fails', () => {
    publishError = new Error('publish failed')

    assert.throws(
      () => main([]),
      (error: Error) => {
        assert.match(error.message, /trusted publisher/)
        assert.equal(error.cause, publishError)
        return true
      }
    )
  })
})

function isNpmPublishCommand(template: TemplateStringsArray, ...values: any[]): boolean {
  const command = template
    .reduce((acc, part, index) => `${acc}${part}${values[index] || ''}`, '')
    .replace(/\s+/g, ' ')
    .trim()
  return command.includes('npm publish')
}
