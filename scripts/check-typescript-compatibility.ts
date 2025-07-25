import * as fs from 'fs'
import * as path from 'path'
import { printLog, runMain } from './lib/executionUtils'
import { command } from './lib/command'

const TEST_APP_DIR = path.join(__dirname, '..', 'test', 'apps', 'vanilla')

interface TypeScriptCheck {
  title: string
  version: string
  compilerOptions?: Partial<any>
}

runMain(() => {
  printLog('Building project...')
  command`yarn build`.run()
  command`lerna run pack --stream`.run()

  printLog('Setting up test environment...')
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(TEST_APP_DIR).run()

  const checks: TypeScriptCheck[] = [
    {
      title: 'TypeScript 3.8.2 compatibility',
      version: '3.8.2',
    },
    {
      title: 'TypeScript isolated modules compatibility',
      compilerOptions: { isolatedModules: true },
      version: '3.8.2',
    },
    {
      title: 'TypeScript 4.1.6 compatibility',
      version: '4.1.6',
    },
    {
      title: 'TypeScript latest compatibility',
      version: 'latest',
    },
    {
      title: 'exactOptionalPropertyTypes compatibility',
      version: 'latest', // Not available in 3.8.2
      compilerOptions: { exactOptionalPropertyTypes: true },
    },
    {
      title: 'ESNext compatibility',
      version: 'latest',
      compilerOptions: { lib: ['ESNext', 'DOM'] },
    },
  ]

  for (const { title, compilerOptions, version } of checks) {
    printLog(`Checking ${title}...`)
    if (compilerOptions) {
      modifyTestAppConfig(compilerOptions)
    }
    command`yarn add --dev typescript@${version}`.withCurrentWorkingDirectory(TEST_APP_DIR).run()
    try {
      command`yarn compat:tsc`.withCurrentWorkingDirectory(TEST_APP_DIR).run()
    } catch (error) {
      const newError = new Error(`${title} compatibility broken`)
      ;(newError as any).cause = error
      throw newError
    } finally {
      command`git checkout -- ${TEST_APP_DIR}`.run()
    }
  }

  printLog('All TypeScript compatibility checks passed.')
})

function modifyTestAppConfig(partialCompilerOptions: any): void {
  const configPath = path.join(TEST_APP_DIR, 'tsconfig.json')
  const originalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  fs.writeFileSync(
    configPath,
    JSON.stringify({ compilerOptions: { ...originalConfig.compilerOptions, ...partialCompilerOptions } }, null, 2)
  )
}
