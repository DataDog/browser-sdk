import { createInterface } from 'node:readline/promises'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Writable } from 'node:stream'
import { printError, printLog, printWarning, runMain } from '../lib/executionUtils.ts'
import { findPackageJsonFiles } from '../lib/filesUtils.ts'
import { command } from '../lib/command.ts'

const TOKEN_NAME = 'browser-sdk-granular'

runMain(async () => {
  if (getLoggedInUser() !== 'datadog') {
    printError('You must be logged in as datadog. Run `npm login` and try again.')
    process.exit(1)
  }

  const accessToken = findAccessTokenFromNpmrc()
  if (!accessToken) {
    printError('Could not find NPM token in ~/.npmrc. Make sure you have logged in with `npm login`')
    process.exit(1)
  }

  const publishablePackages = findPublisheablePackages()
  const missingPackages = await findMissingPackages(publishablePackages)

  if (missingPackages.length > 0) {
    printWarning("The following packages don't exist yet on the npm registry:")
    for (const packageName of missingPackages) {
      printWarning(`  - ${packageName}`)
    }
    printWarning(
      'Renewing the granular token with non-existing packages will fail. Placeholder packages must be published first.'
    )

    const answer = await prompt({ question: 'Publish placeholder packages now? [y/N] ' })
    if (answer.toLowerCase() !== 'y') {
      printError('Aborting. Either publish the missing packages or mark them as private in their package.json.')
      process.exit(1)
    }

    publishPlaceholderPackages(missingPackages)
  }

  const password = await prompt({ question: 'npmjs.com password: ', showOutput: false })
  const otp = await prompt({ question: 'npmjs.com OTP: ' })

  const { objects: tokens } = await callNpmApi<{
    objects: Array<{ name: string; key: string }>
  }>({
    route: 'tokens',
    method: 'GET',
    otp,
    accessToken,
  })

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

  const result = await callNpmApi<{ token: string }>({
    route: 'tokens',
    method: 'POST',
    body: {
      password,
      name: TOKEN_NAME,
      token_description: 'Token used to publish Browser SDK packages (@datadog/browser-*) from the CI.',
      expires: 90,
      bypass_2fa: true,
      packages: publishablePackages,
      packages_and_scopes_permission: 'read-write',
    },
    otp,
    accessToken,
  })

  printLog('Token created')

  printLog('Updating AWS SSM parameter...')
  command`
    aws-vault exec sso-build-stable-developer -- aws ssm put-parameter --region=us-east-1 --name=ci.browser-sdk.npm_token --value=${result.token} --type SecureString --overwrite
  `
    .withLogs()
    .run()

  printLog('All done!')
})

function getLoggedInUser() {
  try {
    return command`npm whoami`.run().trim()
  } catch {
    return undefined
  }
}

async function callNpmApi<T>({
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
}): Promise<T> {
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

  return responseBody as T
}

async function findMissingPackages(packageNames: string[]): Promise<string[]> {
  const results = await Promise.all(
    packageNames.map(async (packageName) => {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`)
      return response.status === 404 ? [packageName] : []
    })
  )
  return results.flat()
}

function publishPlaceholderPackages(packageNames: string[]): void {
  for (const packageName of packageNames) {
    publishPlaceholderPackage(packageName)
  }
}

function publishPlaceholderPackage(packageName: string): void {
  printLog(`Publishing placeholder for ${packageName}...`)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-sdk-placeholder-'))
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          name: packageName,
          version: '0.0.0',
          publishConfig: { access: 'public' },
        },
        null,
        2
      )
    )

    fs.writeFileSync(path.join(tmpDir, 'README.md'), `Placeholder for package ${packageName}\n`)

    command`npm publish`.withCurrentWorkingDirectory(tmpDir).withLogs().run()
    printLog(`Published placeholder for ${packageName}`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
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
