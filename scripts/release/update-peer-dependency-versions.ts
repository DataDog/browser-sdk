import { readFileSync } from 'node:fs'
import { runMain } from '../lib/executionUtils.ts'
import { modifyFile } from '../lib/filesUtils.ts'
import { command } from '../lib/command.ts'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'
import { packagesDirectoryNames } from '../lib/packagesDirectoryNames.ts'

const JSON_FILES = packagesDirectoryNames.map((packageName) => `./packages/${packageName}/package.json`)

// This script updates the peer dependency versions between rum and logs packages to match the new
// version during a release.
//
// Lerna [intentionally removed support for it][1], and [closed a feature request asking for an
// option to bump them on publish][2], but we still want to make sure this version is updated as
// well to warn users who use different versions of RUM and Logs packages.
//
// [1]: https://github.com/lerna/lerna/commit/bdbfc62966e5351abfeac77830f9d47b6d69f1b1
// [2]: https://github.com/lerna/lerna/issues/1575
runMain(async () => {
  for (const jsonFile of JSON_FILES) {
    const packageJson = JSON.parse(readFileSync(jsonFile, 'utf8'))
    if (packageJson?.private) {
      continue
    }

    await modifyFile(jsonFile, updateJsonPeerDependencies)
  }
  // update yarn.lock to match the updated JSON files
  command`yarn`.run()
})

function updateJsonPeerDependencies(content: string): string {
  const json = JSON.parse(content)
  Object.keys(json.peerDependencies || [])
    .filter((key) => key.startsWith('@datadog'))
    .forEach((key) => {
      json.peerDependencies[key] = browserSdkVersion
    })
  return `${JSON.stringify(json, null, 2)}\n`
}
