import type { SfSession } from './sfAuth.ts'

const SALESFORCE_API_VERSION = '67.0'
const TRUSTED_SITE_NAME_PREFIX = 'DatadogE2EIntake'
const TRUSTED_SITE_TTL_HOURS = 24

const ensuredOrigins = new Set<string>()
const createdTrustedSiteNames = new Set<string>()
let staleCleanupPromise: Promise<void> | undefined

interface CspTrustedSiteRecord {
  Id: string
  DeveloperName: string
  EndpointUrl: string
  CreatedDate?: string
}

interface SalesforceQueryResult<T> {
  records?: T[]
}

export async function ensureSalesforceTrustedUrl(session: SfSession, origin: string) {
  if (ensuredOrigins.has(origin)) {
    return
  }

  staleCleanupPromise ??= cleanupStaleTrustedUrls(session)
  await staleCleanupPromise

  const trustedSiteName = buildTrustedSiteName(origin)
  const existingRecord = await querySingleTrustedSite(session, trustedSiteName)

  if (existingRecord) {
    await toolingRequest(session, `/sobjects/CspTrustedSite/${existingRecord.Id}`, {
      method: 'PATCH',
      body: JSON.stringify(buildTrustedSiteUpdatePayload(origin)),
    })
  } else {
    await toolingRequest(session, '/sobjects/CspTrustedSite', {
      method: 'POST',
      body: JSON.stringify(buildTrustedSiteCreatePayload(trustedSiteName, origin)),
    })
  }

  createdTrustedSiteNames.add(trustedSiteName)
  ensuredOrigins.add(origin)
}

export async function cleanupSalesforceTrustedUrls(session: SfSession | undefined) {
  if (!session) {
    return
  }

  for (const trustedSiteName of createdTrustedSiteNames) {
    const record = await querySingleTrustedSite(session, trustedSiteName)
    if (record) {
      await toolingRequest(session, `/sobjects/CspTrustedSite/${record.Id}`, { method: 'DELETE' })
    }
  }
  createdTrustedSiteNames.clear()
  ensuredOrigins.clear()
}

async function cleanupStaleTrustedUrls(session: SfSession) {
  const cutoff = Date.now() - TRUSTED_SITE_TTL_HOURS * 60 * 60 * 1000
  const query =
    'SELECT Id, DeveloperName, EndpointUrl, CreatedDate FROM CspTrustedSite ' +
    `WHERE DeveloperName LIKE '${TRUSTED_SITE_NAME_PREFIX}%'`
  const result = await toolingQuery<CspTrustedSiteRecord>(session, query)

  await Promise.all(
    (result.records ?? [])
      .filter((record) => record.CreatedDate && new Date(record.CreatedDate).getTime() < cutoff)
      .map((record) => toolingRequest(session, `/sobjects/CspTrustedSite/${record.Id}`, { method: 'DELETE' }))
  )
}

async function querySingleTrustedSite(session: SfSession, trustedSiteName: string) {
  const result = await toolingQuery<CspTrustedSiteRecord>(
    session,
    `SELECT Id, DeveloperName, EndpointUrl FROM CspTrustedSite WHERE DeveloperName = '${escapeSoqlString(
      trustedSiteName
    )}' LIMIT 1`
  )
  return result.records?.[0]
}

function buildTrustedSiteCreatePayload(trustedSiteName: string, origin: string) {
  return {
    DeveloperName: trustedSiteName,
    MasterLabel: trustedSiteName,
    ...buildTrustedSiteUpdatePayload(origin),
  }
}

function buildTrustedSiteUpdatePayload(origin: string) {
  return {
    EndpointUrl: origin,
    Context: 'All',
    Description: 'Datadog Browser SDK E2E local intake',
    IsActive: true,
    IsApplicableToConnectSrc: true,
    IsApplicableToFontSrc: false,
    IsApplicableToFrameSrc: false,
    IsApplicableToImgSrc: false,
    IsApplicableToMediaSrc: false,
    IsApplicableToStyleSrc: false,
  }
}

function buildTrustedSiteName(origin: string) {
  const { port } = new URL(origin)
  const runId = process.env.CI_JOB_ID || process.env.GITHUB_RUN_ID || process.env.USER || 'local'
  const runPart = sanitizeNamePart(runId).slice(0, 32).replace(/_+$/u, '') || 'local'
  const rawName = `${TRUSTED_SITE_NAME_PREFIX}_${runPart}_${process.pid}_${port}`

  return sanitizeDeveloperName(rawName).slice(0, 80).replace(/_+$/u, '')
}

function sanitizeDeveloperName(value: string) {
  const sanitized = sanitizeNamePart(value).replace(/^_+/u, '')

  return /^[A-Za-z]/u.test(sanitized) ? sanitized : `${TRUSTED_SITE_NAME_PREFIX}_${sanitized}`
}

function sanitizeNamePart(value: string) {
  return value.replace(/[^A-Za-z0-9]+/gu, '_').replace(/_+/gu, '_')
}

function toolingQuery<T>(session: SfSession, query: string) {
  const searchParams = new URLSearchParams({ q: query })
  return toolingRequest<SalesforceQueryResult<T>>(session, `/query?${searchParams.toString()}`)
}

async function toolingRequest<T = unknown>(session: SfSession, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${session.instanceUrl}/services/data/v${SALESFORCE_API_VERSION}/tooling${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`Salesforce Tooling API request failed: ${response.status} ${await response.text()}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function escapeSoqlString(value: string) {
  return value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")
}
