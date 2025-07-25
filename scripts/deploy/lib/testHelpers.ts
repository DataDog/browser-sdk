import { mock as nodeMock } from 'node:test'

interface CommandDetail {
  command: string
  env?: NodeJS.ProcessEnv
}

export async function mockModule(modulePath: string, mockObject: Record<string, any>): Promise<void> {
  const { default: defaultExport, ...namedExports } = await import(modulePath)

  nodeMock.module(modulePath, {
    defaultExport,
    namedExports: {
      ...namedExports,
      ...mockObject,
    },
  })
}

export const FAKE_AWS_ENV_CREDENTIALS = {
  AWS_ACCESS_KEY_ID: 'FAKEACCESSKEYID123456',
  AWS_SECRET_ACCESS_KEY: 'FAKESECRETACCESSKEY123456',
  AWS_SESSION_TOKEN: 'FAKESESSIONTOKEN123456',
}

export const FAKE_CHUNK_HASH = 'FAKEHASHd7628536637b074ddc3b'

export function mockCommandImplementation(mock: { mock: { mockImplementation: (fn: any) => void } }): CommandDetail[] {
  const commands: CommandDetail[] = []

  mock.mock.mockImplementation((template: TemplateStringsArray, ...values: any[]) => {
    const command = rebuildStringTemplate(template, ...values)
    const commandDetail: CommandDetail = { command }
    const result = {
      withInput: () => result,
      withEnvironment: (newEnv: NodeJS.ProcessEnv) => {
        commandDetail.env = newEnv
        return result
      },
      withCurrentWorkingDirectory: () => result,
      withLogs: () => result,
      run() {
        commands.push(commandDetail)

        if (command.includes('aws sts assume-role')) {
          return JSON.stringify({
            Credentials: {
              AccessKeyId: FAKE_AWS_ENV_CREDENTIALS.AWS_ACCESS_KEY_ID,
              SecretAccessKey: FAKE_AWS_ENV_CREDENTIALS.AWS_SECRET_ACCESS_KEY,
              SessionToken: FAKE_AWS_ENV_CREDENTIALS.AWS_SESSION_TOKEN,
            },
          })
        }
      },
    }
    return result
  })

  return commands
}

function rebuildStringTemplate(template: TemplateStringsArray, ...values: any[]): string {
  const combinedString = template.reduce((acc, part, i) => acc + part + (values[i] || ''), '')
  const normalizedString = combinedString.replace(/\s+/g, ' ').trim()
  return normalizedString
}

export function replaceChunkHashes(commandDetail: CommandDetail): CommandDetail {
  return {
    ...commandDetail,
    command: commandDetail.command.replace(/-[a-f0-9]+-datadog-rum/g, `-${FAKE_CHUNK_HASH}-datadog-rum`),
  }
}
