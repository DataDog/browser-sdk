import { readFileSync } from 'node:fs'
import { createGitHubRelease } from '../lib/gitUtils.ts'
import { printLog, runMain } from '../lib/executionUtils.ts'

interface ReleaseInfo {
  version: string
  body: string
}

interface GitHubReleaseResponse {
  html_url: string
}

runMain(async () => {
  const requestedVersion = process.argv[2]
  printLog(`Creating GitHub release for ${requestedVersion ? `version ${requestedVersion}` : 'latest version'}`)
  const versionAndBody = getReleaseVersionAndBody(requestedVersion)
  const response = (await createGitHubRelease(versionAndBody)) as GitHubReleaseResponse
  printLog(`GitHub release created: ${response.html_url}`)
})

/**
 * Get the version and body of the release to create.
 *
 * @param requestedVersion - The version to create a release for.
 * @return The version and body for the release
 */
function getReleaseVersionAndBody(requestedVersion?: string): ReleaseInfo {
  for (const { version, body } of iterReleases()) {
    if (!requestedVersion || version === requestedVersion) {
      return { version, body }
    }
  }

  throw new Error('No releases found in CHANGELOG.md')
}

/**
 * Iterate over the releases in the CHANGELOG.md file.
 *
 * @returns An iterator of releases
 */
function* iterReleases(): Iterable<ReleaseInfo> {
  const changelog = readFileSync('CHANGELOG.md', 'utf8')
  const titleMatches = changelog.matchAll(/^## (v\d+\.\d+\.\d+)/gm)
  let titleMatch = titleMatches.next().value as RegExpMatchArray | undefined
  while (titleMatch) {
    const nextTitleMatch = titleMatches.next().value as RegExpMatchArray | undefined
    const version = titleMatch[1]
    const body = changelog.slice(titleMatch.index! + titleMatch[0].length, nextTitleMatch?.index).trim()
    yield { version, body }
    titleMatch = nextTitleMatch
  }
}
