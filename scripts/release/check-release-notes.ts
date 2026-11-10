import releasePleaseConfig from '../../release-please-config.json' with { type: 'json' }
import { command } from '../lib/command.ts'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { fetchMergedPullRequests } from '../lib/gitUtils.ts'

// Passed as an argument: `command` doesn't use a shell, so the glob reaches `git describe --match` as is.
const RELEASE_TAG_PATTERN = 'v[0-9]*'
const CONVENTIONAL_COMMIT_REGEX = /^(?<type>[a-z]+)(\([^()]*\))?!?: /
// Label release-please puts on its release pull request until the release is tagged.
const PENDING_RELEASE_LABEL = 'autorelease: pending'

export interface GitCommit {
  sha: string
  subject: string
}

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main(process.env.CI_COMMIT_SHA ?? command`git rev-parse HEAD`.run().trim()))
}

/**
 * Run before `release-please github-release`. The release pull request is refreshed on every push
 * to main. If it is merged right after another pull request, before it was refreshed, that other
 * change would be released without a changelog entry. Fail in that case, so no tag is created.
 */
export async function main(sha: string): Promise<void> {
  const releasePullRequest = (await fetchMergedPullRequests(sha)).find(({ labels }) =>
    labels.some(({ name }) => name === PENDING_RELEASE_LABEL)
  )
  if (!releasePullRequest) {
    printLog(`${sha.slice(0, 7)} is not a release pull request merge: nothing to check`)
    return
  }

  const commits = getCommits(`${findPreviousReleaseSha(sha)}..${sha}^`)
  const missingCommits = findMissingCommits(releasePullRequest.body ?? '', commits, getVisibleTypes())
  if (missingCommits.length > 0) {
    throw new Error(
      `Release pull request #${releasePullRequest.number} was merged before listing these commits:\n` +
        `${missingCommits.map((commit) => `  ${commit.sha.slice(0, 7)} ${commit.subject}`).join('\n')}\n` +
        `No tag was created. Add the missing entries to the release notes in #${releasePullRequest.number}'s ` +
        'description and to CHANGELOG.md (follow-up PR), then retry this job.'
    )
  }
  printLog(`Release pull request #${releasePullRequest.number} lists every commit`)
}

/**
 * The previous Browser SDK release: the closest `vX.Y.Z` tag on main, or `last-release-sha` before
 * the first release made by release-please (legacy tags are not on main).
 */
function findPreviousReleaseSha(releaseSha: string): string {
  const lastReleaseSha = releasePleaseConfig['last-release-sha']
  let tag: string
  try {
    tag = command`git describe --tags --abbrev=0 --match ${RELEASE_TAG_PATTERN} ${releaseSha}^`.run().trim()
  } catch {
    return lastReleaseSha // no release tag on main yet
  }
  const tagSha = command`git rev-list -n 1 ${tag}`.run().trim()
  return isAncestor(lastReleaseSha, tagSha) ? tagSha : lastReleaseSha
}

function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    command`git merge-base --is-ancestor ${ancestor} ${descendant}`.run()
    return true
  } catch {
    return false
  }
}

function getCommits(range: string): GitCommit[] {
  return command`git log --format=%H%x09%s ${range}`
    .run()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...subject] = line.split('\t')
      return { sha, subject: subject.join('\t') }
    })
}

/** Types listed in a visible changelog section: release-please adds an entry for each such commit. */
export function getVisibleTypes(
  config: { 'changelog-sections': Array<{ type: string; hidden?: boolean }> } = releasePleaseConfig
): Set<string> {
  return new Set(config['changelog-sections'].filter(({ hidden }) => !hidden).map(({ type }) => type))
}

/**
 * Find the Conventional Commits of a visible type whose sha is not linked from the release notes.
 * Other commits (legacy gitmoji titles, hidden types) never get a changelog entry, so they are
 * only logged.
 */
export function findMissingCommits(notes: string, commits: GitCommit[], visibleTypes: Set<string>): GitCommit[] {
  const missingCommits: GitCommit[] = []
  for (const commit of commits) {
    const type = CONVENTIONAL_COMMIT_REGEX.exec(commit.subject)?.groups?.type
    if (!type || !visibleTypes.has(type)) {
      printLog(`Not expected in the changelog: ${commit.sha.slice(0, 7)} ${commit.subject}`)
      continue
    }
    if (!notes.includes(commit.sha)) {
      missingCommits.push(commit)
    }
  }
  return missingCommits
}
