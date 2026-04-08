#!/usr/bin/env node
'use strict'

/**
 * Patches the installed dd-trace package with the dd-trace/next entry point.
 *
 * This copies the Next.js helpers (withDatadogServerAction, getDatadogTraceMetadata,
 * datadogOnRequestError) into node_modules/dd-trace and adds the `exports` field
 * so Turbopack can resolve `import { ... } from 'dd-trace/next'`.
 *
 * This script is temporary — once dd-trace ships with ./next built-in, it can be removed.
 *
 * Usage: node scripts/patch-dd-trace-next.js
 */

const fs = require('fs')
const path = require('path')

const PATCH_DIR = path.join(__dirname, 'dd-trace-next-patch')
const DD_TRACE_INSTALLED = path.join(__dirname, '..', 'node_modules', 'dd-trace')

if (!fs.existsSync(DD_TRACE_INSTALLED)) {
  console.log('dd-trace not installed, skipping patch')
  process.exit(0)
}

const filesToCopy = [
  'next.js',
  'next.d.ts',
  'packages/datadog-plugin-next/src/serverAction.js',
  'packages/datadog-plugin-next/src/traceMetadata.js',
  'packages/datadog-plugin-next/src/requestError.js',
  'packages/datadog-plugin-next/src/utils/parseSessionCookie.js',
]

for (const file of filesToCopy) {
  const src = path.join(PATCH_DIR, file)
  const dest = path.join(DD_TRACE_INSTALLED, file)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

// Patch exports field in package.json
const pkgPath = path.join(DD_TRACE_INSTALLED, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
pkg.exports = {
  '.': { types: './index.d.ts', default: './index.js' },
  './init': './init.js',
  './next': { types: './next.d.ts', default: './next.js' },
  './register': './register.js',
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log('Patched dd-trace with dd-trace/next entry point')
