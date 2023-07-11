#!/usr/bin/env node

const path = require('path')
const fs = require('fs')

const bundlePath = path.resolve(__dirname, '../bundle')
const workerBundlePath = path.join(bundlePath, 'worker.js')
const workerBundleContent = fs.readFileSync(workerBundlePath, { encoding: 'utf-8' })

const workerString = `${JSON.stringify(workerBundleContent)}\n`
writeOutput('cjs', `exports.workerString = ${workerString}`)
writeOutput('esm', `export const workerString = ${workerString}`)

function writeOutput(moduleType, content) {
  const outputPath = path.resolve(__dirname, path.join('..', moduleType, 'entries'))
  fs.mkdirSync(outputPath, { recursive: true })
  fs.writeFileSync(path.join(outputPath, 'string.js'), content)
  fs.writeFileSync(path.join(outputPath, 'string.d.ts'), 'export declare const workerString: string\n')
}
