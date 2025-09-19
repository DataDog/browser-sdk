import { fetchHandlingError } from '../../lib/executionUtils.ts'
import { getOrg2ApiKey } from '../../lib/secrets.ts'
import { browserSdkVersion } from '../../lib/browserSdkVersion.ts'

export async function reportToDatadog(
  logData: Record<string, number | string | Record<string, number>>
): Promise<void> {
  await fetchHandlingError('https://http-intake.logs.datadoghq.com/api/v2/logs', {
    method: 'POST',
    headers: {
      'DD-API-KEY': getOrg2ApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      {
        service: 'browser-sdk',
        ddsource: 'browser-sdk',
        env: 'ci',
        version: browserSdkVersion,
        commit: process.env.CI_COMMIT_SHORT_SHA,
        branch: process.env.CI_COMMIT_REF_NAME,
        ...logData,
      },
    ]),
  })
}
