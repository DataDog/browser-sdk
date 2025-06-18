// @ts-check

import { readFileSync } from 'node:fs'
import { createGitHubRelease } from '../lib/gitUtils.js'
import { printLog, runMain } from '../lib/executionUtils.js'

runMain(async () => {
  const requestedVersion = process.argv[2]
  printLog(`Creating GitHub release for ${requestedVersion ? `version ${requestedVersion}` : 'latest version'}`)
  const versionAndBody = getReleaseVersionAndBody(requestedVersion)
  const response = await createGitHubRelease(versionAndBody)
  printLog(`GitHub release created: ${response.html_url}`)
})

/**
 * @param {string} requestedVersion
 * @return {{ version: string, body: string }}
 */
function getReleaseVersionAndBody(requestedVersion) {
  for (const { version, body } of iterReleases()) {
    if (!requestedVersion || version === requestedVersion) {
      return { version, body }
    }
  }

  throw new Error('No releases found in CHANGELOG.md')
}

/**
 * @returns {Iterable<{version: string, body: string}>}
 */
function* iterReleases() {
  const changelog = readFileSync('CHANGELOG.md', 'utf8')
  const titleMatches = changelog.matchAll(/^## (v\d+\.\d+\.\d+)/gm)
  let titleMatch = titleMatches.next().value
  while (titleMatch) {
    const nextTitleMatch = titleMatches.next().value
    const version = titleMatch[1]
    const body = changelog.slice(titleMatch.index + titleMatch[0].length, nextTitleMatch?.index).trim()
    yield { version, body }
    titleMatch = nextTitleMatch
  }
}
