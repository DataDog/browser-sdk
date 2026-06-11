import { spawnSync } from 'node:child_process'

const orgAlias = process.env.SF_ORG_ALIAS ?? 'engrumdev'

export interface SfSession {
  instanceUrl: string
  accessToken: string
}

export function getSfSession(): SfSession {
  if (process.env.SF_INSTANCE_URL && process.env.SF_ACCESS_TOKEN) {
    return {
      instanceUrl: process.env.SF_INSTANCE_URL,
      accessToken: process.env.SF_ACCESS_TOKEN,
    }
  }

  const { status, stdout, stderr } = spawnSync('sf', ['org', 'display', '-o', orgAlias, '--json'], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  })

  if (status !== 0) {
    throw new Error(
      `Could not get SF session for org '${orgAlias}'. Run 'sf org display -o ${orgAlias}' to diagnose.\n${stderr}`
    )
  }

  const result = JSON.parse(stdout).result
  if (!result?.instanceUrl || !result?.accessToken) {
    throw new Error(
      `Could not get SF session for org '${orgAlias}'. ` +
        'Set SF_INSTANCE_URL and SF_ACCESS_TOKEN for CI, or authenticate with the Salesforce CLI locally.'
    )
  }

  return {
    instanceUrl: result.instanceUrl as string,
    accessToken: result.accessToken as string,
  }
}

export function buildFrontdoorUrl(session: SfSession, retPath: string): string {
  const base = session.instanceUrl.replace(/\/+$/, '')
  return `${base}/secur/frontdoor.jsp?sid=${session.accessToken}&retURL=${encodeURIComponent(retPath)}`
}
