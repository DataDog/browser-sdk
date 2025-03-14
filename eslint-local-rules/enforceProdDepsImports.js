const fs = require('fs')
const moduleVisitor = require('eslint-module-utils/moduleVisitor').default
const importType = require('eslint-plugin-import/lib/core/importType').default
const pkgUp = require('eslint-module-utils/pkgUp').default

// The import/no-extraneous-dependencies rule cannot catch this issue[1] where we imported an
// aliased package in production code, because it resolves[2] the alias to the real package name, and
// the real package name is a peer dependency, so it is allowed.
//
// This custom rule is more straightforward than the import/no-extraneous-dependencies rule, and
// should better suit our needs.
//
// [1]: https://github.com/DataDog/browser-sdk/pull/3405
// [2]: https://github.com/import-js/eslint-plugin-import/blob/4f145a2c64af4931f4bf3ae951c8b719b544718f/src/rules/no-extraneous-dependencies.js#L221-L223

const packageJsonCache = new Map()

module.exports = {
  meta: {
    docs: {
      description: 'Forbids importing non-prod dependencies in prod files',
    },
    schema: [],
  },
  /**
   * @returns {Record<string, Function>}
   */
  create(context) {
    const packageJson = readPackageJson(pkgUp({ cwd: context.getFilename() }))

    return moduleVisitor((source) => {
      const importTypeResult = importType(source.value, context)
      // Use an allow list instead of a deny list to make the rule more future-proof.
      if (importTypeResult === 'parent' || importTypeResult === 'sibling') {
        return
      }

      const packageName = parsePackageName(source.value)
      if (!packageJson.dependencies?.[packageName] && !packageJson.peerDependencies?.[packageName]) {
        context.report(source, `${packageName} in not a prod or peer dependency`)
      }
    })
  },
}

/**
 * Parses the package name from an import source, in particular removes a potential entry path.
 *
 * @example
 * parsePackageName('foo/bar') // 'foo'
 * parsePackageName('@foo/bar/baz') // '@foo/bar'
 */
function parsePackageName(importSource) {
  return importSource.split('/', importSource.startsWith('@') ? 2 : 1).join('/')
}

function readPackageJson(packageJsonPath) {
  if (!packageJsonCache.has(packageJsonPath)) {
    packageJsonCache.set(packageJsonPath, JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')))
  }
  return packageJsonCache.get(packageJsonPath)
}
