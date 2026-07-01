import { resolve } from 'node:path'
import { command } from './command.ts'

const salesforceAppDir = resolve(import.meta.dirname, '../../../apps/sf-lwc-app')
const salesforceHomePath = '/lightning/app/c__SF_LWC_App/page/home'
const defaultTargetOrg = 'sf-lwc-ci'

// The frontdoor.jsp OTP expires in ~1 minute, so the URL must be generated at test time —
// not at suite startup — to guarantee a valid token when the test actually navigates.
export function buildSalesforceLwcUrl(proxy?: string): string {
  const targetOrg = process.env.SF_TARGET_ORG ?? defaultTargetOrg
  const path = new URL(salesforceHomePath, 'https://salesforce.local')

  // c__datadogInitConfiguration must be part of the path (not a top-level frontdoor.jsp param)
  // so that Salesforce passes it through to the Lightning app after authentication.
  if (proxy) {
    path.searchParams.set(
      'c__datadogInitConfiguration',
      JSON.stringify({
        applicationId: '37fe52bf-b3d5-4ac7-ad9b-44882d479ec8',
        clientToken: 'pubf2099de38f9c85797d20d64c7d632a69',
        defaultPrivacyLevel: 'allow',
        trackResources: true,
        trackLongTasks: true,
        proxy,
      })
    )
  }

  const output = command`sf org open --target-org ${targetOrg} --path ${path.pathname}${path.search} --url-only`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .run()

  // The sf CLI appends ANSI reset codes (\x1b[39m etc.) directly to the URL on stdout.
  // Excluding control characters (0x00–0x1f, which includes ESC/0x1b) strips them cleanly.
  // eslint-disable-next-line no-control-regex
  const url = output.match(/https:\/\/[^\s\x00-\x1f]+/g)?.at(-1)
  if (!url) {
    throw new Error(`Unable to find Salesforce URL in command output:\n${output}`)
  }
  return url
}
