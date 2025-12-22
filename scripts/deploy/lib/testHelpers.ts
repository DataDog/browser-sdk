import { mock, type Mock } from 'node:test'

export async function mockModule(modulePath: string, mockObject: Record<string, any>): Promise<void> {
  const moduleExports = await import(modulePath)

  // If the module only has named exports (no default export)
  if (!moduleExports.default) {
    mock.module(modulePath, {
      namedExports: {
        ...moduleExports,
        ...mockObject,
      },
    })
  } else {
    // If the module has a default export
    const { default: defaultExport, ...namedExports } = moduleExports

    mock.module(modulePath, {
      defaultExport,
      namedExports: {
        ...namedExports,
        ...mockObject,
      },
    })
  }
}

export const FAKE_AWS_ENV_CREDENTIALS = {
  AWS_ACCESS_KEY_ID: 'FAKEACCESSKEYID123456',
  AWS_SECRET_ACCESS_KEY: 'FAKESECRETACCESSKEY123456',
  AWS_SESSION_TOKEN: 'FAKESESSIONTOKEN123456',
} as const

export const FAKE_CHUNK_HASH = 'FAKEHASHd7628536637b074ddc3b'

export interface CommandDetail {
  command: string
  env?: Record<string, string>
}

interface CommandChain {
  withInput: () => CommandChain
  withEnvironment: (env: Record<string, string>) => CommandChain
  withCurrentWorkingDirectory: () => CommandChain
  withLogs: () => CommandChain
  run: () => string | undefined
}

export function mockCommandImplementation(mockFn: Mock<(...args: any[]) => void>): CommandDetail[] {
  const commands: CommandDetail[] = []

  mockFn.mock.mockImplementation((template: TemplateStringsArray, ...values: any[]): CommandChain => {
    const command = rebuildStringTemplate(template, ...values)
    const commandDetail: CommandDetail = { command }

    const result: CommandChain = {
      withInput: () => result,
      withEnvironment: (newEnv: Record<string, string>) => {
        commandDetail.env = newEnv
        return result
      },
      withCurrentWorkingDirectory: () => result,
      withLogs: () => result,
      run(): string | undefined {
        if (command.startsWith('aws sts assume-role')) {
          return JSON.stringify({
            Credentials: {
              AccessKeyId: FAKE_AWS_ENV_CREDENTIALS.AWS_ACCESS_KEY_ID,
              SecretAccessKey: FAKE_AWS_ENV_CREDENTIALS.AWS_SECRET_ACCESS_KEY,
              SessionToken: FAKE_AWS_ENV_CREDENTIALS.AWS_SESSION_TOKEN,
            },
          })
        }

        if (command.startsWith('ddtool datacenters list')) {
          return JSON.stringify([
            { name: 'ap1.prod.dog', site: 'ap1.datadoghq.com' },
            { name: 'ap2.prod.dog', site: 'ap2.datadoghq.com' },
            { name: 'eu1.prod.dog', site: 'datadoghq.eu' },
            { name: 'us1.prod.dog', site: 'datadoghq.com' },
            { name: 'us3.prod.dog', site: 'us3.datadoghq.com' },
            { name: 'us5.prod.dog', site: 'us5.datadoghq.com' },
            { name: 'prtest00.prod.dog', site: 'prtest00.datadoghq.com' },
            { name: 'prtest01.prod.dog', site: 'prtest01.datadoghq.com' },
          ])
        }

        // don't push command details for the above mock commands
        commands.push(commandDetail)
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
