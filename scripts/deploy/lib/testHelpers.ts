import { mock, type Mock } from 'node:test'
import type { Datacenter } from '../../lib/datacenter.ts'

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
export const FAKE_RUNTIME_METADATA_SERVICE_TOKEN = 'FAKE_RUNTIME_METADATA_SERVICE_TOKEN'

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

        // don't push command details for the above mock commands
        commands.push(commandDetail)
      },
    }
    return result
  })

  return commands
}

export const MOCK_DATACENTERS: Datacenter[] = [
  { name: 'ap1', site: 'ap1.datadoghq.com', type: 'minor' },
  { name: 'ap2', site: 'ap2.datadoghq.com', type: 'minor' },
  { name: 'eu1', site: 'datadoghq.eu', type: 'major' },
  { name: 'us1', site: 'datadoghq.com', type: 'major' },
  { name: 'us3', site: 'us3.datadoghq.com', type: 'minor' },
  { name: 'us5', site: 'us5.datadoghq.com', type: 'minor' },
  { name: 'prtest00', site: 'prtest00.datadoghq.com', type: 'private' },
  { name: 'prtest01', site: 'prtest01.datadoghq.com', type: 'private' },
]

const MOCK_DATACENTER_RESPONSE = MOCK_DATACENTERS.map((dc) => ({ name: `${dc.name}.prod.dog`, site: dc.site }))

type FetchMockHandler = (url: string, options?: RequestInit) => Promise<Response> | undefined

/**
 * Creates a mock Response object for testing fetch calls.
 *
 * @param options - Configuration options for the mock response
 * @param options.status - HTTP status code (default: 200)
 * @param options.json - JSON data to return (default: {})
 * @returns A mock Response object
 */
export function createMockResponse({ status = 200, json = {} }: { status?: number; json?: any } = {}): Response {
  return {
    ok: status < 300,
    status,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json)),
  } as unknown as Response
}

/**
 * Configure a fetchHandlingError mock with datacenter API support.
 * Can be extended with an additional handler for test-specific API calls.
 *
 * @param fetchHandlingErrorMock - The mock function to configure
 * @param additionalHandler - Optional custom handler that runs before default handlers.
 * Should return a Response promise if it handles the URL, or undefined to let default handlers try.
 * @example
 * // Simple usage with just datacenter mocks
 * mockFetchHandlingError(fetchMock)
 * @example
 * // Extended with telemetry API mock
 * mockFetchHandlingError(fetchMock, (url) => {
 *   if (url.includes('api.datadoghq.com')) {
 *     return Promise.resolve({ json: () => Promise.resolve({ data: [] }) } as Response)
 *   }
 * })
 */
export function mockFetchHandlingError(
  fetchHandlingErrorMock: Mock<(...args: any[]) => any>,
  additionalHandler?: FetchMockHandler
): void {
  fetchHandlingErrorMock.mock.mockImplementation((url: string, options?: RequestInit) => {
    // Try additional handler first (for test-specific mocks)
    if (additionalHandler) {
      const result = additionalHandler(url, options)
      if (result) {
        return result
      }
    }

    // Vault token request
    if (url.includes('/v1/identity/oidc/token/runtime-metadata-service')) {
      return Promise.resolve(
        createMockResponse({
          json: {
            data: {
              token: FAKE_RUNTIME_METADATA_SERVICE_TOKEN,
            },
          },
        })
      )
    }

    // Datacenters request
    if (url.includes('runtime-metadata-service')) {
      return Promise.resolve(createMockResponse({ json: { datacenters: MOCK_DATACENTER_RESPONSE } }))
    }

    // Default response
    return Promise.resolve(createMockResponse())
  })
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
