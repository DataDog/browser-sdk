#!/usr/bin/env node

const path = require('path')
const fs = require('fs')
const glob = require('glob')
const { printLog, runMain } = require('../../../scripts/lib/execution-utils')
const { modifyFile } = require('../../../scripts/lib/files-utils')

const bundlePath = path.resolve(__dirname, '../bundle')
const workerBundlePath = path.join(bundlePath, 'worker.js')
const workerBundleContent = fs.readFileSync(workerBundlePath, { encoding: 'utf-8' })
const workerString = JSON.stringify(workerBundleContent)

runMain(async () => {
  const buildDirectory = process.argv[2]

  for (const path of glob.sync('**/*.js', { cwd: buildDirectory, absolute: true })) {
    if (await modifyFile(path, replaceBuildEnv)) {
      printLog(`Replaced worker string in ${path}`)
    }
  }
})

function replaceBuildEnv(content) {
  return content.replaceAll('__WORKER_STRING__', workerString)
}
