const { mock } = require('node:test')

async function mockModule(modulePath, mockObject) {
  const { default: defaultExport, ...namedExports } = await import(modulePath)

  mock.module(modulePath, {
    defaultExport,
    namedExports: {
      ...namedExports,
      ...mockObject,
    },
  })
}

const FAKE_AWS_ENV_CREDENTIALS = {
  AWS_ACCESS_KEY_ID: 'FAKEACCESSKEYID123456',
  AWS_SECRET_ACCESS_KEY: 'FAKESECRETACCESSKEY123456',
  AWS_SESSION_TOKEN: 'FAKESESSIONTOKEN123456',
}

const FAKE_CHUNK_HASH = 'FAKEHASHd7628536637b074ddc3b'

function mockCommandImplementation(mock) {
  const commands = []

  mock.mock.mockImplementation((template, ...values) => {
    const command = rebuildStringTemplate(template, ...values)
    let commandDetail = { command }
    const result = {
      withInput: () => result,
      withEnvironment: (newEnv) => {
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

function rebuildStringTemplate(template, ...values) {
  const combinedString = template.reduce((acc, part, i) => acc + part + (values[i] || ''), '')
  const normalizedString = combinedString.replace(/\s+/g, ' ').trim()
  return normalizedString
}

function replaceChunkHashes(commandDetail) {
  return {
    ...commandDetail,
    command: commandDetail.command.replace(/-[a-f0-9]+-datadog-rum/g, `-${FAKE_CHUNK_HASH}-datadog-rum`),
  }
}

module.exports = {
  mockModule,
  mockCommandImplementation,
  replaceChunkHashes,
  FAKE_AWS_ENV_CREDENTIALS,
  FAKE_CHUNK_HASH,
}
