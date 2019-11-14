const execSync = require('child_process').execSync
const packageJson = require('./package.json')
const replace = require('replace-in-file')

/**
 * Replace BuildEnv in build files
 * Usage:
 * TARGET_DC=xxx TARGET_ENV=yyy VERSION=zzz node replace-build-env.js /path/to/build/directory
 */

const buildDirectory = process.argv[2]

const buildEnv = {
  TARGET_DC: process.env.TARGET_DC || 'us',
  TARGET_ENV: process.env.TARGET_ENV || 'staging',
  VERSION: `${process.env.VERSION !== 'release' ? 'dev' : packageJson.version}-${execSync('git rev-parse HEAD')
    .toString()
    .trim()}`,
}

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
