import type { CandidateRelease } from 'release-please'
import releasePleaseConfig from '../../release-please-config.json' with { type: 'json' }
import { command } from './command.ts'
import { printLog } from './executionUtils.ts'

// Passed as an argument: `command` doesn't use a shell, so the glob reaches `git describe --match` as is.
const RELEASE_TAG_PATTERN = 'v[0-9]*'
const CONVENTIONAL_COMMIT_REGEX = /^(?<type>[a-z]+)(\([^()]*\))?!?: /

export interface GitCommit {
  sha: string
  subject: string
}

interface PendingRelease {
  pullRequestNumber: number
  sha: string
  notes: string
}

/**
 * Run before `Manifest.createReleases()` (see release-please.ts), with the releases it is about to
 * tag: one per component of every merged release pull request that is still pending. The release
 * pull request is refreshed on every push to main. If it is merged right after another pull request,
 * before it was refreshed, that other change would be released without a changelog entry. Fail in
 * that case, so no tag is created.
 *
 * Every pending release is checked, not only the one merged by the current commit: a release that
 * failed this check stays pending, and the pipeline of the next merge would tag it otherwise.
 */
export function checkReleaseNotes(candidateReleases: CandidateRelease[]): void {
  const pendingReleases = new Map<number, PendingRelease>()
  for (const { pullRequest, sha, notes } of candidateReleases) {
    const pendingRelease = pendingReleases.get(pullRequest.number)
    if (pendingRelease) {
      pendingRelease.notes += `\n${notes}`
    } else {
      pendingReleases.set(pullRequest.number, { pullRequestNumber: pullRequest.number, sha, notes })
    }
  }
  if (pendingReleases.size === 0) {
    printLog('No pending release: nothing to check')
    return
  }

  const errors = [...pendingReleases.values()].flatMap(checkPendingRelease)
  if (errors.length > 0) {
    throw new Error(`${errors.join('\n\n')}\n\nNo tag was created.`)
  }
}

function checkPendingRelease({ pullRequestNumber, sha, notes }: PendingRelease): string[] {
  // The release may have been merged after this pipeline fetched its sources.
  if (!commitExists(sha)) {
    command`git fetch origin ${sha}`.run()
  }

  const commits = getCommits(`${findPreviousReleaseSha(sha)}..${sha}^`)
  const missingCommits = findMissingCommits(notes, commits, getVisibleTypes())
  if (missingCommits.length === 0) {
    printLog(`Release pull request #${pullRequestNumber} lists every commit`)
    return []
  }
  return [
    `Release pull request #${pullRequestNumber} was merged before listing these commits:\n` +
      `${missingCommits.map((commit) => `  ${commit.sha.slice(0, 7)} ${commit.subject}`).join('\n')}\n` +
      `Cancel the release: revert the merge commit of #${pullRequestNumber}, remove its "autorelease: pending" label, ` +
      'then merge the revert. release-please then opens a new release pull request (see the release runbook).',
  ]
}

function commitExists(sha: string): boolean {
  try {
    command`git cat-file -e ${`${sha}^{commit}`}`.run()
    return true
  } catch {
    return false
  }
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
