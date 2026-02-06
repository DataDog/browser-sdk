#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolve } from 'path'
import express from 'express'
import { createServer as createViteServer } from 'vite'
import { WebSocketServer } from 'ws'
import { buildEnvKeys, getBuildEnvValue } from '../../../scripts/lib/buildEnv.ts'
import { handleTestExecution } from './testExecutionHandler.ts'
import { launchChrome } from './chromeLauncher.ts'

const ROOT = resolve(import.meta.dirname, '../../..')

// Parse CLI arguments
const { values } = parseArgs({
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
    },
    seed: {
      type: 'string',
      description: 'Random seed for test execution',
    },
    'stop-on-failure': {
      type: 'boolean',
      description: 'Stop test execution on first failure',
    },
    headless: {
      type: 'boolean',
      description: 'Launch Chrome headless automatically',
    },
  },
})

const specPattern: string | null = values.spec ?? null
const watchMode = values.watch ?? false
const seed: string | undefined = values.seed
const stopOnFailure = values['stop-on-failure'] ?? false
const headless = values.headless ?? false

console.log('Starting Vite dev server...')

const viteServer = await createViteServer({
  root: import.meta.dirname,
  server: { middlewareMode: true, watch: watchMode ? {} : null },
  resolve: {
    alias: [
      { find: /^@datadog\/browser-([^\\/]+)$/, replacement: `${ROOT}/packages/$1/src` },
      { find: /^@datadog\/browser-(.+\/.*)$/, replacement: `${ROOT}/packages/$1` },
      { find: /^packages\/(.*)$/, replacement: `${ROOT}/packages/$1` },
      { find: /^\.\/allJsonSchemas$/, replacement: `${import.meta.dirname}/browser/allJsonSchemas.ts` },
    ],
  },
  define: Object.fromEntries(
    buildEnvKeys.map((key) => [`__BUILD_ENV__${key}__`, JSON.stringify(getBuildEnvValue(key))])
  ),
})

const app = express()
const httpServer = app.listen(8080, () => {
  console.log('Vite dev server started on http://localhost:8080')

  // Launch Chrome headless if requested
  if (headless) {
    launchChrome('http://localhost:8080')
  }
})

app.use(viteServer.middlewares)

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', async (ws) => {
  console.log('Browser connected via WebSocket')
  console.log(`Running specs matching: ${specPattern === null ? 'all specs' : specPattern}`)
  if (watchMode) {
    console.log('Watch mode enabled - server will stay running')
  }
  if (seed) {
    console.log(`Using seed: ${seed}`)
  }
  if (stopOnFailure) {
    console.log('Stop on failure enabled')
  }

  try {
    const result = await handleTestExecution(ws, { specPattern, seed, stopOnFailure })

    if (watchMode) {
      console.log('\nWaiting for changes...')
    } else {
      const exitCode = result.success ? 0 : 1
      process.exit(exitCode)
    }
  } catch (error) {
    console.error('Test execution error:', error)
    if (!watchMode) {
      process.exit(1)
    }
  }
})
