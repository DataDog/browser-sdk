#!/usr/bin/env node

const path = require('path')
const fs = require('fs')

const bundlePath = path.resolve(__dirname, '../bundle')
const workerBundlePath = path.join(bundlePath, 'worker.js')
const workerStringPath = path.join(bundlePath, 'workerString.ts')
const workerBundleContent = fs.readFileSync(workerBundlePath, { encoding: 'utf-8' })

fs.writeFileSync(workerStringPath, `export const workerString = ${JSON.stringify(workerBundleContent)}`)
