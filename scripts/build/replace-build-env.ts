import { globSync } from 'node:fs'
import { resolve } from 'node:path'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { modifyFile } from '../lib/filesUtils.ts'
import { buildEnvKeys, getBuildEnvValue } from '../lib/buildEnv.ts'

/**
 * Replace BuildEnv in build files
 * Usage:
 * BUILD_MODE=zzz node replace-build-env.ts /path/to/build/directory
 */

runMain(async () => {
  const buildDirectory = process.argv[2]

  for (const path of globSync('**/*.js', { cwd: buildDirectory })) {
    if (await modifyFile(resolve(buildDirectory, path), (content: string) => replaceBuildEnv(content))) {
      printLog(`Replaced BuildEnv in ${path}`)
    }
  }
})

function replaceBuildEnv(content: string): string {
  return buildEnvKeys.reduce(
    (content, key) => content.replaceAll(`__BUILD_ENV__${key}__`, () => JSON.stringify(getBuildEnvValue(key))),
    content
  )
}
