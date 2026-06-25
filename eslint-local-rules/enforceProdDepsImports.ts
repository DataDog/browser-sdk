import fs from 'node:fs'

import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'
import { importType, moduleVisitor, pkgUp } from 'eslint-plugin-import-x/utils'

// The import/no-extraneous-dependencies rule cannot catch this issue[1] where we imported an
// aliased package in production code, because it resolves[2] the alias to the real package name, and
// the real package name is a peer dependency, so it is allowed.
//
// This custom rule is more straightforward than the import/no-extraneous-dependencies rule, and
// should better suit our needs.
//
// [1]: https://github.com/DataDog/browser-sdk/pull/3405
// [2]: https://github.com/import-js/eslint-plugin-import/blob/4f145a2c64af4931f4bf3ae951c8b719b544718f/src/rules/no-extraneous-dependencies.js#L221-L223

interface PackageJson {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const packageJsonCache = new Map<string, PackageJson>()

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: 'Forbids importing non-prod dependencies in prod files',
    },
    schema: [],
    messages: {
      nonProdDependency: '{{packageName}} in not a prod or peer dependency',
    },
    type: 'suggestion',
  },
  create(context) {
    const packageJson = readPackageJson(pkgUp({ cwd: context.filename })!)

    return moduleVisitor((source) => {
      const importTypeResult = importType(source.value, context)
      // Use an allow list instead of a deny list to make the rule more future-proof.
      if (importTypeResult === 'parent' || importTypeResult === 'sibling') {
        return
      }

      const packageName = parsePackageName(source.value)
      if (!packageJson.dependencies?.[packageName] && !packageJson.peerDependencies?.[packageName]) {
        context.report({
          node: source,
          messageId: 'nonProdDependency',
          data: { packageName },
        })
      }
    })
  },
})

/**
 * Parses the package name from an import source, in particular removes a potential entry path.
 *
 * @example
 * ```ts
 * parsePackageName('foo/bar') // 'foo'
 * parsePackageName('@foo/bar/baz') // '@foo/bar'
 * ```
 */
function parsePackageName(importSource: string) {
  return importSource.split('/', importSource.startsWith('@') ? 2 : 1).join('/')
}

function readPackageJson(packageJsonPath: string) {
  if (!packageJsonCache.has(packageJsonPath)) {
    packageJsonCache.set(packageJsonPath, JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')))
  }
  return packageJsonCache.get(packageJsonPath)!
}
