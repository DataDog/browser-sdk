import * as fs from 'fs'
import { packagesDirectoryNames } from '../../../lib/packagesDirectoryNames'
import { command } from '../../../lib/command'

const PACKAGES_REVERSE_DEPENDENCIES = (() => {
  const result = new Map<string, Set<string>>()
  packagesDirectoryNames.forEach((packageDirectoryName) => {
    for (const dependency of getDepenciesRecursively(packageDirectoryName)) {
      if (!result.has(dependency)) {
        result.set(dependency, new Set())
      }
      result.get(dependency)!.add(packageDirectoryName)
    }
  })
  return result
})()

export function getAffectedPackages(hash: string): string[] {
  const changedFiles = command`git diff-tree --no-commit-id --name-only -r ${hash}`.run().trim().split('\n')
  const affectedPackages = new Set<string>()

  changedFiles.forEach((filePath) => {
    const packageDirectoryName = getPackageDirectoryNameFromFilePath(filePath)
    if (packageDirectoryName) {
      if (!isToplevelPackage(packageDirectoryName)) {
        PACKAGES_REVERSE_DEPENDENCIES.get(packageDirectoryName)?.forEach((dependentPackageDirectoryName) => {
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

function getPackageDirectoryNameFromFilePath(filePath: string): string | undefined {
  if (filePath.startsWith('packages/')) {
    return filePath.split('/')[1]
  }
}

function isToplevelPackage(packageDirectoryName: string): boolean {
  return !PACKAGES_REVERSE_DEPENDENCIES.has(packageDirectoryName)
}

function getPackageDirectoryNameFromPackageName(packageName: string): string | undefined {
  if (packageName.startsWith('@datadog/browser-')) {
    return packageName.slice('@datadog/browser-'.length)
  }
}

function getDepenciesRecursively(packageDirectoryName: string): Set<string> {
  const packageDirectoryNameJson = JSON.parse(
    fs.readFileSync(`packages/${packageDirectoryName}/package.json`, { encoding: 'utf-8' })
  )
  const dependencies = new Set<string>()
  if (packageDirectoryNameJson.dependencies) {
    for (const dependencyPackageName of Object.keys(packageDirectoryNameJson.dependencies)) {
      const packageDirectoryName = getPackageDirectoryNameFromPackageName(dependencyPackageName)
      if (packageDirectoryName) {
        dependencies.add(packageDirectoryName)
        for (const transitiveDependency of getDepenciesRecursively(packageDirectoryName)) {
          dependencies.add(transitiveDependency)
        }
      }
    }
  }
  return dependencies
}
