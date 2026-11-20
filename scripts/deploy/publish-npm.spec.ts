import assert from 'node:assert/strict'
import path from 'node:path'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import { mockModule } from './lib/testHelpers.ts'

interface RecordedCommand {
  command: string
  env?: Record<string, string>
}

interface CommandChain {
  withEnvironment: (env: Record<string, string>) => CommandChain
  withLogs: () => CommandChain
  run: () => void
}

describe('publish-npm', () => {
  const commandMock = mock.fn<(template: TemplateStringsArray, ...values: any[]) => CommandChain>()
  const isSemanticVersionMock = mock.fn<(input: string | undefined) => boolean>()

  let main: (args?: string[]) => void
  let commands: RecordedCommand[]
  let publishError: Error | undefined
  let originalNpmToken: string | undefined
  let originalGithubActions: string | undefined

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/filesUtils.ts'), {
      isSemanticVersion: isSemanticVersionMock,
    })

    const publishNpmModule: { main: (args?: string[]) => void } = await import('./publish-npm.ts')
    ;({ main } = publishNpmModule)
  })

  beforeEach(() => {
    originalNpmToken = process.env.NPM_TOKEN
    originalGithubActions = process.env.GITHUB_ACTIONS
    delete process.env.NPM_TOKEN
    delete process.env.GITHUB_ACTIONS

    commands = []
    publishError = undefined
    isSemanticVersionMock.mock.mockImplementation(() => true)
    commandMock.mock.mockImplementation((template, ...values): CommandChain => {
      const recorded: RecordedCommand = { command: rebuildCommand(template, values) }
      const chain: CommandChain = {
        withEnvironment: (env) => {
          recorded.env = env
          return chain
        },
        withLogs: () => chain,
        run: () => {
          commands.push(recorded)
          if (publishError && isNpmPublishCommand(recorded)) {
            throw publishError
          }
        },
      }
      return chain
    })
  })

  afterEach(() => {
    restoreEnv('NPM_TOKEN', originalNpmToken)
    restoreEnv('GITHUB_ACTIONS', originalGithubActions)
  })

  function publishCommand(): RecordedCommand {
    const publish = commands.find(isNpmPublishCommand)
    assert.ok(publish, 'npm publish should have run')
    return publish
  }

  it('builds in release mode, then publishes the packages', () => {
    main([])

    assert.deepEqual(
      commands.map(({ command }) => command.split(' ').slice(0, 2).join(' ')),
      ['yarn build', 'yarn workspaces']
    )
    assert.deepEqual(commands[0].env, { BUILD_MODE: 'release' })
    assert.match(publishCommand().command, /--tolerate-republish --access public/)
  })

  describe('authentication', () => {
    it('uses OIDC trusted publishing when no NPM_TOKEN is set', () => {
      main([])

      assert.equal(publishCommand().env?.BUILD_MODE, 'release')
      assert.ok(!('YARN_NPM_AUTH_TOKEN' in publishCommand().env!))
    })

    it('uses OIDC trusted publishing when NPM_TOKEN is empty', () => {
      // GitHub Actions expands a missing secret to an empty string
      process.env.NPM_TOKEN = ''

      main([])

      assert.ok(!('YARN_NPM_AUTH_TOKEN' in publishCommand().env!))
    })

    it('passes NPM_TOKEN to yarn when it is set', () => {
      process.env.NPM_TOKEN = 'fake-token'

      main([])

      assert.equal(publishCommand().env?.YARN_NPM_AUTH_TOKEN, 'fake-token')
    })
  })

  describe('provenance', () => {
    it('generates provenance in GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true'

      main([])

      assert.match(publishCommand().command, /--provenance/)
    })

    it('does not ask for provenance outside GitHub Actions', () => {
      main([])

      assert.doesNotMatch(publishCommand().command, /--provenance/)
    })
  })

  describe('dry run', () => {
    it('passes --dry-run on to yarn', () => {
      main(['--dry-run'])

      assert.match(publishCommand().command, /--dry-run/)
    })

    it('does not pass --dry-run by default', () => {
      main([])

      assert.doesNotMatch(publishCommand().command, /--dry-run/)
    })
  })

  describe('prerelease guard', () => {
    beforeEach(() => {
      isSemanticVersionMock.mock.mockImplementation(() => false)
    })

    it('refuses to publish a version that is not X.Y.Z', () => {
      assert.throws(() => main([]), /Refusing to publish version/)
      assert.equal(commands.length, 0, 'nothing should be built or published')
    })

    it('still allows a dry run', () => {
      main(['--dry-run'])

      assert.match(publishCommand().command, /--dry-run/)
    })
  })

  describe('when the publish fails', () => {
    beforeEach(() => {
      publishError = new Error('publish failed')
    })

    it('hints at the trusted publisher configuration with OIDC, and keeps the cause', () => {
      assert.throws(
        () => main([]),
        (error: Error) => {
          assert.match(error.message, /trusted publisher/)
          assert.match(error.message, /retry step-6/)
          assert.doesNotMatch(error.message, /NPM_TOKEN secret of the npm-publish environment/)
          assert.equal(error.cause, publishError)
          return true
        }
      )
    })

    it('hints at the NPM_TOKEN secret with a token, and keeps the cause', () => {
      process.env.NPM_TOKEN = 'fake-token'

      assert.throws(
        () => main([]),
        (error: Error) => {
          assert.match(error.message, /NPM_TOKEN secret of the npm-publish environment/)
          assert.match(error.message, /retry step-6/)
          assert.doesNotMatch(error.message, /fake-token/)
          assert.equal(error.cause, publishError)
          return true
        }
      )
    })
  })
})

function rebuildCommand(template: TemplateStringsArray, values: any[]): string {
  return template
    .reduce((acc, part, index) => `${acc}${part}${[values[index]].flat().join(' ') || ''}`, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isNpmPublishCommand({ command }: RecordedCommand): boolean {
  return command.includes('npm publish')
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
