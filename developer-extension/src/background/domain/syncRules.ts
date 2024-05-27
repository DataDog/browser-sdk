import type { NetRequestRulesOptions } from '../../common/types'
import { DEV_LOGS_URL, DEV_RUM_SLIM_URL, DEV_RUM_URL, INTAKE_DOMAINS } from '../../common/constants'
import { createLogger } from '../../common/logger'
import { onDevtoolsDisconnection, onDevtoolsMessage } from '../devtoolsPanelConnection'

const logger = createLogger('syncRules')

onDevtoolsDisconnection.subscribe((tabId) => {
  clearRules(tabId).catch((error) => logger.error('Error while clearing rules:', error))
})

onDevtoolsMessage.subscribe((message) => {
  if (message.type === 'update-net-request-rules') {
    updateRules(message.options).catch((error) => logger.error('Error while updating rules:', error))
  }
})

async function clearRules(tabId: number) {
  logger.log(`Clearing rules for tab ${tabId}`)
  const { tabRuleIds } = await getExistingRulesInfos(tabId)
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: tabRuleIds,
  })
  await chrome.browsingData.removeCache({})
}

async function updateRules(options: NetRequestRulesOptions) {
  logger.log(`Updating rules for tab ${options.tabId}`)
  const { tabRuleIds, nextRuleId } = await getExistingRulesInfos(options.tabId)
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: buildRules(options, nextRuleId),
    removeRuleIds: tabRuleIds,
  })
  await chrome.browsingData.removeCache({})
}

async function getExistingRulesInfos(tabId: number) {
  const rules = await chrome.declarativeNetRequest.getSessionRules()

  let nextRuleId = 1
  const tabRuleIds: number[] = []
  for (const rule of rules) {
    if (rule.condition.tabIds?.includes(tabId)) {
      tabRuleIds.push(rule.id)
    } else {
      nextRuleId = rule.id + 1
    }
  }

  return { tabRuleIds, nextRuleId }
}

function buildRules(
  { tabId, useDevBundles, useRumSlim, blockIntakeRequests }: NetRequestRulesOptions,
  nextRuleId: number
) {
  const rules: chrome.declarativeNetRequest.Rule[] = []
  let id = nextRuleId

  if (useDevBundles === 'cdn') {
    const devRumUrl = useRumSlim ? DEV_RUM_SLIM_URL : DEV_RUM_URL
    logger.log('add redirect to dev bundles rules')
    rules.push(
      createRedirectRule(/^https:\/\/.*\/datadog-rum(-v\d|-canary|-staging)?\.js$/, { url: devRumUrl }),
      createRedirectRule(/^https:\/\/.*\/datadog-rum-slim(-v\d|-canary|-staging)?\.js$/, {
        url: DEV_RUM_SLIM_URL,
      }),
      createRedirectRule(/^https:\/\/.*\/datadog-logs(-v\d|-canary|-staging)?\.js$/, { url: DEV_LOGS_URL }),
      createRedirectRule('https://localhost:8443/static/datadog-rum-hotdog.js', { url: devRumUrl })
    )
  } else if (useRumSlim) {
    logger.log('add redirect to rum slim rule')
    rules.push(createRedirectRule(/^(https:\/\/.*\/datadog-rum)(-slim)?/, { regexSubstitution: '\\1-slim' }))
  }

  if (blockIntakeRequests) {
    logger.log('add block intake rules')
    for (const intakeDomain of INTAKE_DOMAINS) {
      rules.push({
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.BLOCK,
        },
        condition: { tabIds: [tabId], urlFilter: `||${intakeDomain}` },
        id: id++,
      })
    }
  }

  function createRedirectRule(
    filter: RegExp | string,
    redirect: chrome.declarativeNetRequest.Redirect
  ): chrome.declarativeNetRequest.Rule {
    const tabIds = [tabId]
    return {
      action: {
        redirect,
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      },
      condition:
        typeof filter === 'string' ? { tabIds, urlFilter: `|${filter}|` } : { regexFilter: filter.source, tabIds },
      id: id++,
    }
  }

  return rules
}
