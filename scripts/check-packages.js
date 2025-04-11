const fs = require('fs')
const path = require('path')
const glob = require('glob')
const minimatch = require('minimatch')
const { printLog, printError, runMain } = require('./lib/executionUtils')
const { command } = require('./lib/command')

runMain(() => {
  let success = true
  for (const packagePath of glob.globSync('packages/*')) {
    if (packagePath.includes('rum-extra-slim')) {
      continue
    }
    success = checkPackage(packagePath) && success
  }

  if (success) {
    printLog('Packages check done.')
  } else {
    printError('Packages check failed.')
    process.exitCode = 1
  }
})

function checkPackage(packagePath) {
  printLog(`Checking ${packagePath}`)
  const packageFiles = getPackageFiles(packagePath)
  return checkPackageJsonEntryPoints(packagePath, packageFiles) && checkNpmIgnore(packagePath, packageFiles)
}

function getPackageFiles(packagePath) {
  // Yarn behavior is a bit different from npm regarding `.npmignore` globs. Since we are publishing
  // packages using npm through Lerna[1], let's use npm to list files here.
  //
  // [1]: Quoting Lerna doc: "Lerna always uses npm to publish packages."
  // https://lerna.js.org/docs/features/version-and-publish#from-package
  const output = command`npm pack --dry-run --json`.withCurrentWorkingDirectory(packagePath).run()
  return JSON.parse(output)[0].files.map((file) => file.path)
}

function checkPackageJsonEntryPoints(packagePath, packageFiles) {
  const filesFromPackageJsonEntryPoints = packageFiles
    .filter((file) => file.endsWith('package.json'))
    .flatMap((packageJsonPath) => {
      const content = JSON.parse(fs.readFileSync(path.join(packagePath, packageJsonPath)))
      return [content.main, content.module, content.types]
        .filter(Boolean)
        .map((entryPointPath) => path.join(path.dirname(packageJsonPath), entryPointPath))
    })

  for (const file of filesFromPackageJsonEntryPoints) {
    if (!packageFiles.includes(file)) {
      printError(`File ${file} used as an entry point in ${packagePath} is missing from the package`)
      return false
    }
  }
  return true
}

// NPM will [always include some files][1] like `package.json` and `README.md`.
// [1]: https://docs.npmjs.com/cli/v9/using-npm/developers#keeping-files-out-of-your-package
const FILES_ALWAYS_INCLUDED_BY_NPM = ['package.json', 'README.md']

function checkNpmIgnore(packagePath, packageFiles) {
  const npmIgnorePath = path.join(packagePath, '.npmignore')
  const npmNegatedIgnoreRules = fs
    .readFileSync(npmIgnorePath, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((glob) => new minimatch.Minimatch(glob, { dot: true, matchBase: true, flipNegate: true }))
    .filter((rule) => rule.negate)

  // Ensure that each file is explicitly included by checking if at least a negated rule matches it
  for (const file of packageFiles) {
    if (!FILES_ALWAYS_INCLUDED_BY_NPM.includes(file) && !npmNegatedIgnoreRules.some((rule) => rule.match(`/${file}`))) {
      printError(`File ${file} is not explicitly included in ${npmIgnorePath}`)
      return false
    }
  }

  // Ensure that expected files are correctly included by checking if each negated rule matches at least one file
  for (const rule of npmNegatedIgnoreRules) {
    if (!packageFiles.some((file) => rule.match(`/${file}`))) {
      printError(`Rule ${rule.pattern} does not match any file ${npmIgnorePath}`)
      return false
    }
  }

  return true
}
