const fs = require('fs')
const { packagesDirectoryNames } = require('../../../lib/packagesDirectoryNames')
const { command } = require('../../../lib/command')

const PACKAGES_REVERSE_DEPENDENCIES = (() => {
  const result = new Map()
  packagesDirectoryNames.forEach((packageDirectoryName) => {
    for (const dependency of getDepenciesRecursively(packageDirectoryName)) {
      if (!result.has(dependency)) {
        result.set(dependency, new Set())
      }
      result.get(dependency).add(packageDirectoryName)
    }
  })
  return result
})()

exports.getAffectedPackages = (hash) => {
  const changedFiles = command`git diff-tree --no-commit-id --name-only -r ${hash}`.run().trim().split('\n')
  const affectedPackages = new Set()

  changedFiles.forEach((filePath) => {
    const packageDirectoryName = getPackageDirectoryNameFromFilePath(filePath)
    if (packageDirectoryName) {
      if (!isToplevelPackage(packageDirectoryName)) {
        PACKAGES_REVERSE_DEPENDENCIES.get(packageDirectoryName).forEach((dependentPackageDirectoryName) => {
          if (isToplevelPackage(dependentPackageDirectoryName)) {
            affectedPackages.add(dependentPackageDirectoryName)
          }
        })
      } else {
        affectedPackages.add(packageDirectoryName)
      }
    }
  })

  return Array.from(affectedPackages)
}

function getPackageDirectoryNameFromFilePath(filePath) {
  if (filePath.startsWith('packages/')) {
    return filePath.split('/')[1]
  }
}

function isToplevelPackage(packageDirectoryName) {
  return !PACKAGES_REVERSE_DEPENDENCIES.has(packageDirectoryName)
}

function getPackageDirectoryNameFromPackageName(packageName) {
  if (packageName.startsWith('@flashcatcloud/browser-')) {
    return packageName.slice('@flashcatcloud/browser-'.length)
  }
}

function getDepenciesRecursively(packageDirectoryName) {
  const packageDirectoryNameJson = JSON.parse(
    fs.readFileSync(`packages/${packageDirectoryName}/package.json`, { encoding: 'utf-8' })
  )
  const dependencies = new Set()
  if (packageDirectoryNameJson.dependencies) {
    for (const dependencyPackageName of Object.keys(packageDirectoryNameJson.dependencies)) {
      const packageDirectoryName = getPackageDirectoryNameFromPackageName(dependencyPackageName)
      dependencies.add(packageDirectoryName)
      for (let transitiveDependency of getDepenciesRecursively(packageDirectoryName)) {
        dependencies.add(transitiveDependency)
      }
    }
  }
  return dependencies
}
