import { fetchHandlingError } from './executionUtils.ts'
import { getOrg2ApiKey } from './secrets.ts'
import { browserSdkVersion } from './browserSdkVersion.ts'

type LogData = Record<string, number | string | Record<string, number>>

export async function reportToDatadog(logData: LogData | LogData[]): Promise<void> {
  const logs = Array.isArray(logData) ? logData : [logData]
  await fetchHandlingError('https://http-intake.logs.datadoghq.com/api/v2/logs', {
    method: 'POST',
    headers: {
      'DD-API-KEY': getOrg2ApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      logs.map((log) => ({
        service: 'browser-sdk',
        ddsource: 'browser-sdk',
        env: 'ci',
        version: browserSdkVersion,
        commit: process.env.CI_COMMIT_SHORT_SHA,
        branch: process.env.CI_COMMIT_REF_NAME,
        ...log,
      }))
    ),
  })
}
