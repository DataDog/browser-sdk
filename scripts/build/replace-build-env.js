const glob = require('glob')
const { printLog, runMain } = require('../lib/executionUtils')
const { modifyFile } = require('../lib/filesUtils')
const { buildEnvKeys, getBuildEnvValue } = require('../lib/buildEnv')

/**
 * Replace BuildEnv in build files
 * Usage:
 * BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
 */

runMain(async () => {
  const buildDirectory = process.argv[2]

  for (const path of glob.sync('**/*.js', { cwd: buildDirectory, absolute: true })) {
    if (await modifyFile(path, (content) => replaceBuildEnv(content))) {
      printLog(`Replaced BuildEnv in ${path}`)
    }
  }
})

function replaceBuildEnv(content) {
  return buildEnvKeys.reduce(
    (content, key) => content.replaceAll(`__BUILD_ENV__${key}__`, () => JSON.stringify(getBuildEnvValue(key))),
    content
  )
}
