const replace = require('replace-in-file')
const buildEnv = require('./build-env')

/**
 * Replace BuildEnv in build files
 * Usage:
 * TARGET_DATACENTER=xxx BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
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
  if (buildEnv.WITH_SUFFIX) {
    replace.sync({
      files: `${buildDirectory}/**/*.js`,
      from: /.*/,
      to: (...args) =>
        `${makeDeprecatedSuffixComment(args[args.length - 1])}\n${args[0]}\n${makeDeprecatedSuffixComment(
          args[args.length - 1]
        )}`,
    })
  }
  console.log('Changed files:', results.filter((entry) => entry.hasChanged).map((entry) => entry.file))
  process.exit(0)
} catch (error) {
  console.error('Error occurred:', error)
  process.exit(1)
}

function makeDeprecatedSuffixComment(filePath) {
  const fileName = filePath.split('/').pop()
  const suffixRegExp = /-(us|eu)/
  const env = fileName.match(suffixRegExp)[1]
  const newFileName = fileName.replace(suffixRegExp, '')
  return `/**\n * ${fileName} IS DEPRECATED, USE ${newFileName} WITH { site: 'datadoghq.${
    env === 'eu' ? 'eu' : 'com'
  }' } INIT CONFIGURATION INSTEAD\n */`
}
