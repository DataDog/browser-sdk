import { DEV_LOGS_URL, DEV_RUM_SLIM_URL, DEV_RUM_URL, INTAKE_DOMAINS } from '../../common/constants'
import { createLogger } from '../../common/logger'
import { onDevtoolsMessage } from '../devtoolsPanelConnection'
import { store } from '../store'

const logger = createLogger('syncRules')

onDevtoolsMessage.subscribe((message) => {
  if (
    message.type === 'set-store' &&
    ('useDevBundles' in message.store || 'useRumSlim' in message.store || 'blockIntakeRequests' in message.store)
  ) {
    void chrome.browsingData.removeCache({})
    syncRules()
  }
})

function syncRules() {
  logger.log('Syncing rules')
  chrome.declarativeNetRequest
    .getSessionRules()
    .then((existingRules) =>
      chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: existingRules.map((rule) => rule.id),
        addRules: getRules(),
      })
    )
    .catch((error) => logger.error('Error while syncing rules:', error))
}

function getRules() {
  const rules: chrome.declarativeNetRequest.Rule[] = []
  let id = 1

  if (store.useDevBundles) {
    const devRumUrl = store.useRumSlim ? DEV_RUM_SLIM_URL : DEV_RUM_URL
    logger.log('add redirect to dev bundles rules')
    rules.push(
      createRedirectRule(id++, /^https:\/\/.*\/datadog-rum(-v\d|-canary|-staging)?\.js$/, { url: devRumUrl }),
      createRedirectRule(id++, /^https:\/\/.*\/datadog-rum-slim(-v\d|-canary|-staging)?\.js$/, {
        url: DEV_RUM_SLIM_URL,
      }),
      createRedirectRule(id++, /^https:\/\/.*\/datadog-logs(-v\d|-canary|-staging)?\.js$/, { url: DEV_LOGS_URL }),
      createRedirectRule(id++, 'https://localhost:8443/static/datadog-rum-hotdog.js', { url: devRumUrl })
    )
  } else if (store.useRumSlim) {
    logger.log('add redirect to rum slim rule')
    rules.push(createRedirectRule(id++, /^(https:\/\/.*\/datadog-rum)(-slim)?/, { regexSubstitution: '\\1-slim' }))
  }

  if (store.blockIntakeRequests) {
    logger.log('add block intake rules')
    for (const intakeDomain of INTAKE_DOMAINS) {
      rules.push({
        id: id++,
        condition: { urlFilter: `||${intakeDomain}` },
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.BLOCK,
        },
      })
    }
  }

  return rules
}

function createRedirectRule(
  id: number,
  filter: RegExp | string,
  redirect: chrome.declarativeNetRequest.Redirect
): chrome.declarativeNetRequest.Rule {
  return {
    id,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect,
    },
    condition: typeof filter === 'string' ? { urlFilter: `|${filter}|` } : { regexFilter: filter.source },
  }
}
