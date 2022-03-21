const glob = require('glob')
const buildEnv = require('./build-env')
const { printLog, logAndExit, modifyFile } = require('./utils')

/**
 * Replace BuildEnv in build files
 * Usage:
 * BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
 */

async function main() {
  const buildDirectory = process.argv[2]

  printLog(`Replacing BuildEnv in '${buildDirectory}' with:`, JSON.stringify(buildEnv, null, 2))

  for (const path of glob.sync('**/*.js', { cwd: buildDirectory, absolute: true })) {
    if (await modifyFile(path, replaceBuildEnv)) {
      printLog(`Replaced BuildEnv in ${path}`)
    }
  }

  process.exit(0)
}

function replaceBuildEnv(content) {
  return Object.keys(buildEnv).reduce(
    (content, key) => content.replaceAll(`__BUILD_ENV__${key}__`, JSON.stringify(buildEnv[key])),
    content
  )
}

main().catch(logAndExit)
