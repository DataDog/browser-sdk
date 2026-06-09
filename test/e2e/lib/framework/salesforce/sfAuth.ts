import { spawnSync } from 'node:child_process'

const orgAlias = process.env.SF_ORG_ALIAS ?? 'engrumdev'

export interface SfSession {
  instanceUrl: string
  accessToken: string
}

export function getSfSession(): SfSession {
  // CI path: authenticate via `sf org login jwt` in the pipeline, then export these two vars.
  // Get the values with: sf org display -o <alias> --json | jq -r '.result.instanceUrl / .accessToken'
  if (process.env.SF_INSTANCE_URL && process.env.SF_ACCESS_TOKEN) {
    return {
      instanceUrl: process.env.SF_INSTANCE_URL,
      accessToken: process.env.SF_ACCESS_TOKEN,
    }
  }

  // Local path: reads the session the SF CLI already holds from `sf org login web` or setup:ebikes
  const { stdout } = spawnSync('sf', ['org', 'display', '-o', orgAlias, '--json'], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  })
  const result = JSON.parse(stdout)?.result

  if (!result?.instanceUrl || !result?.accessToken) {
    throw new Error(
      `Could not get SF session for org '${orgAlias}'. ` +
        `Run 'sf org display -o ${orgAlias}' to diagnose, ` +
        `or set SF_INSTANCE_URL and SF_ACCESS_TOKEN env vars for CI.`
    )
  }

  return {
    instanceUrl: result.instanceUrl as string,
    accessToken: result.accessToken as string,
  }
}

// Uses frontdoor to authenticate and redirect to Salesforce: https://help.salesforce.com/s/articleView?id=000386254&type=1
export function buildFrontdoorUrl(session: SfSession, retPath: string): string {
  const base = session.instanceUrl.replace(/\/+$/, '')
  return `${base}/secur/frontdoor.jsp?sid=${session.accessToken}&retURL=${encodeURIComponent(retPath)}`
}
