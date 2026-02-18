/**
 * CDN Bundle Generator CLI
 *
 * Generates a combined SDK + remote configuration bundle by:
 * 1. Fetching remote configuration from Datadog servers
 * 2. Downloading pre-built SDK from Datadog CDN
 * 3. Combining them into a single JavaScript file
 */

import { parseArgs } from 'node:util'
import * as fs from 'node:fs/promises'
import { runMain, printLog, printError } from '../lib/executionUtils.ts'
import { fetchConfig, downloadSDK, generateCombinedBundle, type SdkVariant } from '../../packages/endpoint/src/index.ts'

function printHelp(): void {
  console.log(`
Usage: npx tsx scripts/build/generate-cdn-bundle.ts [options]

Generates a combined Datadog Browser SDK bundle with embedded remote configuration.

Options:
  -a, --applicationId  Datadog application ID (required)
  -c, --configId       Remote configuration ID (required)
  -v, --variant        SDK variant: "rum" or "rum-slim" (required)
  -o, --output         Output file path (default: stdout)
  -s, --site           Datadog site (default: datadoghq.com)
  -h, --help           Show this help message

Example:
  npx tsx scripts/build/generate-cdn-bundle.ts \\
    --applicationId abc123 \\
    --configId def456 \\
    --variant rum \\
    --output ./datadog-rum-bundle.js

Notes:
  - The generated bundle is self-contained and requires no additional network requests
  - Both "rum" (full) and "rum-slim" (lightweight) variants are supported
  - The bundle auto-initializes when loaded in a browser
`)
}

function validateVariant(variant: string | undefined): variant is SdkVariant {
  return variant === 'rum' || variant === 'rum-slim'
}

runMain(async () => {
  const { values } = parseArgs({
    options: {
      applicationId: { type: 'string', short: 'a' },
      configId: { type: 'string', short: 'c' },
      variant: { type: 'string', short: 'v' },
      output: { type: 'string', short: 'o' },
      site: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    printHelp()
    return
  }

  // Validate required arguments
  const missingArgs: string[] = []
  if (!values.applicationId) {
    missingArgs.push('--applicationId')
  }
  if (!values.configId) {
    missingArgs.push('--configId')
  }
  if (!values.variant) {
    missingArgs.push('--variant')
  }

  if (missingArgs.length > 0) {
    printError(`Missing required arguments: ${missingArgs.join(', ')}`)
    printHelp()
    process.exit(1)
  }

  // Validate variant
  if (!validateVariant(values.variant)) {
    printError(`Invalid variant "${values.variant}". Must be "rum" or "rum-slim".`)
    process.exit(1)
  }

  const variant: SdkVariant = values.variant

  try {
    // Step 1: Fetch remote configuration
    printLog('Fetching remote configuration...')
    const configResult = await fetchConfig({
      applicationId: values.applicationId!,
      remoteConfigurationId: values.configId!,
      site: values.site,
    })

    // Step 2: Download SDK from CDN
    printLog(`Downloading SDK (${variant}) from CDN...`)
    const sdkCode = await downloadSDK(variant)

    // Step 3: Generate combined bundle
    printLog('Generating combined bundle...')
    const bundle = generateCombinedBundle({
      sdkCode,
      config: configResult.value,
      variant,
    })

    // Step 4: Output result
    if (values.output) {
      await fs.writeFile(values.output, bundle, 'utf-8')
      printLog(`Bundle written to ${values.output}`)
      printLog(`Bundle size: ${(bundle.length / 1024).toFixed(2)} KiB`)
    } else {
      console.log(bundle)
    }

    printLog('Done.')
  } catch (error) {
    if (error instanceof Error) {
      printError(error.message)
    } else {
      printError('An unknown error occurred')
    }
    process.exit(2)
  }
})
