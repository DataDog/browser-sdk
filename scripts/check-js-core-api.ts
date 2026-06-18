import { globSync } from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'
import { Extractor, ExtractorConfig, type IConfigFile } from '@microsoft/api-extractor'
import { printError, printLog, runMain } from './lib/executionUtils.ts'

runMain(() => {
  const { values } = parseArgs({
    options: {
      update: { type: 'boolean', default: false },
    },
  })

  const packageDir = path.resolve('packages/js-core')
  const entryPoints = globSync('cjs/entries/*.d.ts', { cwd: packageDir })

  for (const entryPoint of entryPoints) {
    const name = path.basename(entryPoint, '.d.ts')
    printLog(`Checking API surface for @datadog/js-core/${name}...`)

    const configObject: IConfigFile = {
      mainEntryPointFilePath: path.join(packageDir, entryPoint),
      projectFolder: packageDir,
      compiler: {
        tsconfigFilePath: path.join(packageDir, 'tsconfig.api.json'),
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

  if (values.update) {
    printLog('API reports updated.')
  } else {
    printLog('API surface check passed.')
  }
})
