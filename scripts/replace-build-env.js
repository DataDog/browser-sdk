const replace = require('replace-in-file')
const buildEnv = require('./build-env')
const { printLog, logAndExit } = require('./utils')

/**
 * Replace BuildEnv in build files
 * Usage:
 * BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
 */

async function main() {
  const buildDirectory = process.argv[2]

  printLog(`Replacing BuildEnv in '${buildDirectory}' with:`, JSON.stringify(buildEnv, null, 2))

  const results = await replace({
    files: `${buildDirectory}/**/*.js`,
    from: Object.keys(buildEnv).map((entry) => new RegExp(`__BUILD_ENV__${entry}__`, 'g')),
    to: Object.values(buildEnv).map((value) => `"${value}"`),
  })
  printLog(
    'Changed files:',
    results.filter((entry) => entry.hasChanged).map((entry) => entry.file)
  )
  process.exit(0)
}

main().catch(logAndExit)
