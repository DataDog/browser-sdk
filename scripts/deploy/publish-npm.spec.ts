import assert from 'node:assert/strict'
import path from 'node:path'
import { before, beforeEach, describe, it, mock } from 'node:test'
import { mockCommandImplementation, mockModule } from './lib/testHelpers.ts'

interface CommandChain {
  withEnvironment: (env: Record<string, string>) => CommandChain
  withLogs: () => CommandChain
  run: () => string | undefined
}

describe('publish-npm', () => {
  const commandMock = mock.fn<(template: TemplateStringsArray, ...values: any[]) => CommandChain>()
  const getNpmTokenMock = mock.fn<() => string>()

  let main: (args?: string[]) => void
  let publishError: Error

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/secrets.ts'), { getNpmToken: getNpmTokenMock })

    const publishNpmModule: { main: (args?: string[]) => void } = await import('./publish-npm.ts')
    ;({ main } = publishNpmModule)
  })

  beforeEach(() => {
    publishError = new Error('publish failed')
    getNpmTokenMock.mock.mockImplementation(() => 'fake-token')

    const baseCommandMock = mock.fn<(template: TemplateStringsArray, ...values: any[]) => CommandChain>()
    mockCommandImplementation(baseCommandMock)

    commandMock.mock.mockImplementation((template: TemplateStringsArray, ...values: any[]): CommandChain => {
      const chain = baseCommandMock(template, ...values)

      if (isNpmPublishCommand(template, ...values)) {
        const throwingChain: CommandChain = {
          withEnvironment: () => throwingChain,
          withLogs: () => throwingChain,
          run: () => {
            throw publishError
          },
        }

        return {
          ...chain,
          withEnvironment: () => throwingChain,
          withLogs: () => throwingChain,
          run: throwingChain.run,
        }
      }
      return chain
    })
  })

  it('should suggest renewing npm token when npm publish fails', () => {
    assert.throws(
      () => main([]),
      (error: Error) => {
        assert.match(error.message, /scripts\/release\/renew-token\.ts/)
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
