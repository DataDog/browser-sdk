const glob = require('glob')
const { printLog, runMain } = require('../lib/execution-utils')
const { modifyFile } = require('../lib/files-utils')
const buildEnv = require('../lib/build-env')

/**
 * Replace BuildEnv in build files
 * Usage:
 * BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
 */

runMain(async () => {
  const buildDirectory = process.argv[2]

  printLog(`Replacing BuildEnv in '${buildDirectory}' with:`, JSON.stringify(buildEnv, null, 2))

  for (const path of glob.sync('**/*.js', { cwd: buildDirectory, absolute: true })) {
    if (await modifyFile(path, replaceBuildEnv)) {
      printLog(`Replaced BuildEnv in ${path}`)
    }
  }
})

function replaceBuildEnv(content) {
  return Object.keys(buildEnv).reduce(
    (content, key) => content.replaceAll(`__BUILD_ENV__${key}__`, JSON.stringify(buildEnv[key])),
    content
  )
}
