const replace = require('replace-in-file')
const buildEnv = require('./build-env')

/**
 * Replace BuildEnv in build files
 * Usage:
 * TARGET_DATACENTER=xxx TARGET_ENV=yyy BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
 */

const buildDirectory = process.argv[2]

console.log(`Replace BuildEnv in '${buildDirectory}' with:`)
console.log(JSON.stringify(buildEnv, null, 2))

try {
  const results = replace.sync({
    files: `${buildDirectory}/**/*.js`,
    from: Object.keys(buildEnv).map((entry) => `<<< ${entry} >>>`),
    to: Object.values(buildEnv),
  })
  console.log('Changed files:', results.filter((entry) => entry.hasChanged).map((entry) => entry.file))
  process.exit(0)
} catch (error) {
  console.error('Error occurred:', error)
  process.exit(1)
}
