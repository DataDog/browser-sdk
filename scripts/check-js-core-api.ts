import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'
import { Extractor, ExtractorConfig, type IConfigFile } from '@microsoft/api-extractor'
import { printError, printLog, runMain } from './lib/executionUtils.ts'
import { readPackageJson } from './lib/filesUtils.ts'

runMain(() => {
  const { values } = parseArgs({
    options: {
      update: { type: 'boolean', default: false },
    },
  })

  const packageDir = path.resolve('packages/js-core')
  const packageJson = readPackageJson(path.join(packageDir, 'package.json'))
  const subpaths = Object.keys(packageJson.exports ?? {}).map((subpath) => subpath.replace('./', ''))

  for (const name of subpaths) {
    const entryPoint = path.join(packageDir, `cjs/entries/${name}.d.ts`)
    printLog(`Checking API surface for @datadog/js-core/${name}...`)

    const configObject: IConfigFile = {
      mainEntryPointFilePath: entryPoint,
      projectFolder: packageDir,
      compiler: {
        tsconfigFilePath: path.resolve('tsconfig.json'),
      },
      apiReport: {
        enabled: true,
        reportFolder: path.join(packageDir, 'api'),
        reportTempFolder: path.join(packageDir, 'temp'),
        reportFileName: `${name}.api.md`,
      },
    }

    const config = ExtractorConfig.prepare({
      configObject,
      configObjectFullPath: path.join(packageDir, 'api-extractor.ts'),
      packageJsonFullPath: path.join(packageDir, 'package.json'),
    })

    const result = Extractor.invoke(config, {
      localBuild: values.update,
      printApiReportDiff: true,
    })

    if (!result.succeeded) {
      printError(
        `API surface check failed for @datadog/js-core/${name}. Use \`yarn api:check --update\` to update the API report if the changes are intentional`
      )
      process.exit(1)
    }
  }

  const reportFolder = path.join(packageDir, 'api')
  const staleReports = fs
    .readdirSync(reportFolder)
    .filter((file) => file.endsWith('.api.md') && !subpaths.includes(file.replace('.api.md', '')))

  if (staleReports.length > 0) {
    if (values.update) {
      for (const file of staleReports) {
        fs.rmSync(path.join(reportFolder, file))
        printLog(`Deleted stale API report: ${file}`)
      }
    } else {
      printError(`Stale API reports found: ${staleReports.join(', ')}. Use \`yarn api:check --update\` to remove them.`)
      process.exit(1)
    }
  }

  if (values.update) {
    printLog('API reports updated.')
  } else {
    printLog('API surface check passed.')
  }
})
