const glob = require('glob')
const { printLog, runMain } = require('../lib/execution-utils')
const { modifyFile } = require('../lib/files-utils')
const { buildEnvKeys, getBuildEnvValue } = require('../lib/build-env')

/**
 * Replace BuildEnv in build files
 * Usage:
 * BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
 */

runMain(async () => {
  const buildDirectory = process.argv[2]

  for (const path of glob.sync('**/*.js', { absolute: true, cwd: buildDirectory })) {
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
