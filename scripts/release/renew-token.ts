import { createInterface } from 'node:readline/promises'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Writable } from 'node:stream'
import { printError, printLog, runMain } from '../lib/executionUtils.ts'
import { findPackageJsonFiles } from '../lib/filesUtils.ts'

const TOKEN_NAME = 'browser-sdk-granular'

runMain(async () => {
  const accessToken = findAccessTokenFromNpmrc()
  if (!accessToken) {
    printError('Could not find NPM token in ~/.npmrc. Make sure you have logged in with `npm login`')
    process.exit(1)
  }

  const password = await prompt({ question: 'Password: ', showOutput: false })
  const otp = await prompt({ question: 'OTP: ' })

  const { objects: tokens } = (await callNpmApi({
    route: 'tokens',
    method: 'GET',
    otp,
    accessToken,
  })) as {
    objects: Array<{ name: string; key: string }>
  }

  const existingToken = tokens.find((token) => token.name === TOKEN_NAME)
  if (existingToken) {
    printLog('Token already exists, removing it')
    await callNpmApi({
      route: `tokens/token/${existingToken.key}`,
      method: 'DELETE',
      otp,
      accessToken,
    })
  }

  await callNpmApi({
    route: 'tokens',
    method: 'POST',
    body: {
      password,
      name: TOKEN_NAME,
      token_description: 'Token used to publish Browser SDK packages (@datadog/browser-*) from the CI.',
      expires: 90,
      bypass_2fa: true,
      packages: findPublisheablePackages(),
      packages_and_scopes_permission: 'read-write',
    },
    otp,
    accessToken,
  })

  printLog('Token created')
})

async function callNpmApi({
  route,
  method,
  body,
  otp,
  accessToken,
}: {
  route: string
  method: string
  body?: any
  otp: string
  accessToken: string
}): Promise<any> {
  // https://api-docs.npmjs.com/#tag/Tokens/operation/createToken
  const response = await fetch(`https://registry.npmjs.org/-/npm/v1/${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'npm-otp': otp,
    },
    body: body && JSON.stringify(body),
  })

  const responseBody: any = await response.text().then((text) => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  })

  if (!response.ok) {
    printError('Failed to renew token.')
    printError(`NPM API '${method} ${route}' responded with ${response.statusText}`)
    printError(responseBody.error || responseBody)
    process.exit(1)
  }

  return responseBody
}

function findPublisheablePackages() {
  const files = findPackageJsonFiles()
  return files
    .filter(({ content }) => content.version && content.name && !content.private)
    .map(({ content }) => content.name as string)
}

function findAccessTokenFromNpmrc() {
  const npmrcPath = path.join(os.homedir(), '.npmrc')
  try {
    return fs.readFileSync(npmrcPath, 'utf-8').match(/_authToken=(.*)/)?.[1]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

async function prompt({ question, showOutput = true }: { question: string; showOutput?: boolean }) {
  if (!showOutput) {
    process.stdout.write(question)
  }

  const readline = createInterface({
    input: process.stdin,
    output: showOutput
      ? process.stdout
      : new Writable({
          write(_chunk, _encoding, callback) {
            callback()
          },
        }),
    terminal: true,
  })

  const value = await readline.question(question)
  readline.close()
  if (!showOutput) {
    process.stdout.write('\n')
  }
  return value
}
