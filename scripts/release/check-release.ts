import { browserSdkVersion as releaseVersion } from '../lib/browserSdkVersion.ts'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { checkPackageJsonFiles } from '../lib/checkBrowserSdkPackageJsonFiles.ts'

export interface PackageJsonFile {
  relativePath: string
  content: {
    name: string
    version: string
    private?: boolean
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
}

runMain(() => {
  checkGitTag()
  checkPackageJsonFiles()

  printLog('Release check done.')
})

function checkGitTag(): void {
  printLog('Checking release version tag is on HEAD')
  const headRef = command`git rev-parse HEAD`.run()
  let tagRef: string
  try {
    tagRef = command`git rev-list -n 1 v${releaseVersion} --`.run()
  } catch (error) {
    throw new Error(`Failed to find git tag reference: ${error as string}`)
  }
  if (tagRef !== headRef) {
    throw new Error('Git tag not on HEAD')
  }
}
