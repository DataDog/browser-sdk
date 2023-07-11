#!/usr/bin/env node

const path = require('path')
const fs = require('fs')

const bundlePath = path.resolve(__dirname, '../bundle')
const workerBundlePath = path.join(bundlePath, 'worker.js')
const workerBundleContent = fs.readFileSync(workerBundlePath, { encoding: 'utf-8' })

writeOutput('cjs', `exports.workerString = ${JSON.stringify(workerBundleContent)}\n`)
writeOutput('esm', `export const workerString = ${JSON.stringify(workerBundleContent)}\n`)

function writeOutput(moduleType, content) {
  const outputPath = path.resolve(__dirname, path.join('..', 'string', moduleType))
  fs.mkdirSync(outputPath, { recursive: true })
  fs.writeFileSync(path.join(outputPath, 'main.js'), content)
  fs.writeFileSync(path.join(outputPath, 'main.d.ts'), 'export declare const workerString: string\n')
}
