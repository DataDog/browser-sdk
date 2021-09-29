const replace = require('replace-in-file')
const buildEnv = require('./build-env')
const { printLog, printError } = require('./utils')

/**
 * Replace BuildEnv in build files
 * Usage:
 * BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
 */

const buildDirectory = process.argv[2]

printLog(`Replacing BuildEnv in '${buildDirectory}' with:`, JSON.stringify(buildEnv, null, 2))

try {
  const results = replace.sync({
    files: `${buildDirectory}/**/*.js`,
    from: Object.keys(buildEnv).map((entry) => `<<< ${entry} >>>`),
    to: Object.values(buildEnv),
  })
  printLog(
    'Changed files:',
    results.filter((entry) => entry.hasChanged).map((entry) => entry.file)
  )
  process.exit(0)
} catch (error) {
  printError('\nStacktrace:\n', error)
  process.exit(1)
}
