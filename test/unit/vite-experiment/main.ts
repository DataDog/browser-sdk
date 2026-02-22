#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-misused-promises */
import { parseArgs } from 'node:util'
import type { TestRunResults } from './testRunner.ts'
import { TestRunner } from './testRunner.ts'
import type { TestRunOptions } from './types/messages.ts'
import { attachCliReporter } from './cliReporter.ts'
import { startChrome } from './chromeLauncher.ts'
import { startServer } from './server.ts'

const { values: args } = parseArgs({
  options: {
    spec: {
      type: 'string',
      short: 's',
      description: 'Focus on a specific spec file pattern',
    },
    watch: {
      type: 'boolean',
      short: 'w',
      description: 'Watch mode - keep server running after tests complete',
      default: false,
    },
    seed: {
      type: 'string',
      description: 'Random seed for test execution',
    },
    'stop-on-failure': {
      type: 'boolean',
      description: 'Stop test execution on first failure',
      default: false,
    },
    headless: {
      type: 'boolean',
      description: 'Launch Chrome headless automatically',
      default: false,
    },
  },
})

const [httpServer, chrome] = await Promise.all([
  startServer({ watch: args.watch, specPattern: args.spec }),
  args.headless ? startChrome() : undefined,
])

const testRunner = new TestRunner(httpServer)

testRunner.on('connection', async (connection) => {
  const testRunOptions: TestRunOptions = {
    seed: args.seed,
    stopOnFailure: args['stop-on-failure'],
  }

  attachCliReporter(connection, { ...testRunOptions, specPattern: args.spec, watch: args.watch })

  let result: TestRunResults | undefined
  try {
    result = await connection.run(testRunOptions)
  } catch (error) {
    console.error('Test run error:', error)
  }

  if (args.watch) {
    console.log('Waiting for changes...')
  } else {
    const success = result !== undefined && result.specResults.every((spec) => spec.status !== 'failed')
    exit(success ? 0 : 1)
  }
})

if (chrome) {
  await chrome.goTo('http://localhost:8080')
}

function exit(exitCode: number) {
  void Promise.resolve()
    .then(() => chrome?.close())
    .finally(() => process.exit(exitCode))
}
