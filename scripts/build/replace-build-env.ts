import { globSync } from 'glob'
import { printLog, runMain } from '../lib/executionUtils'
import { modifyFile } from '../lib/filesUtils'
import { buildEnvKeys, getBuildEnvValue } from '../lib/buildEnv'

/**
 * Replace BuildEnv in build files
 * Usage:
 * BUILD_MODE=zzz node replace-build-env.js /path/to/build/directory
 */

runMain(async () => {
  const buildDirectory = process.argv[2]

  for (const path of globSync('**/*.js', { cwd: buildDirectory, absolute: true })) {
    if (await modifyFile(path, (content) => replaceBuildEnv(content))) {
      printLog(`Replaced BuildEnv in ${path}`)
    }
  }
})

function replaceBuildEnv(content: string): string {
  return buildEnvKeys.reduce(
    (content, key) =>
      content.replace(new RegExp(`__BUILD_ENV__${key}__`, 'g'), () => JSON.stringify(getBuildEnvValue(key))),
    content
  )
}
