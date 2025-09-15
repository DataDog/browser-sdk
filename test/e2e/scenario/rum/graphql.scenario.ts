import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

test.describe('GraphQL tracking', () => {
  createTest('track GraphQL query via XHR and include payload')
    .withRum({
      allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload: true }],
      enableExperimentalFeatures: ['graphql_tracking'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/graphql')
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.send(
          JSON.stringify({
            query: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
            operationName: 'GetUser',
            variables: { id: '123' },
          })
        )
      })

      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/graphql'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.method).toBe('POST')
      expect(resourceEvent.resource.graphql).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
      })
    })

  createTest('track GraphQL mutation via fetch without payload')
    .withRum({
      allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload: false }],
      enableExperimentalFeatures: ['graphql_tracking'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() =>
        window.fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'mutation CreateUser($input: UserInput!) { createUser(input: $input) { id name } }',
            operationName: 'CreateUser',
            variables: { input: { name: 'John Doe', email: 'john@example.com' } },
          }),
        })
      )

      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/graphql'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.method).toBe('POST')
      expect(resourceEvent.resource.graphql).toEqual({
        operationType: 'mutation',
        operationName: 'CreateUser',
        variables: '{"input":{"name":"John Doe","email":"john@example.com"}}',
        payload: undefined,
      })
    })

  createTest('should not track GraphQL for non-matching URLs')
    .withRum({
      allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload: true }],
      enableExperimentalFeatures: ['graphql_tracking'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', '/ok')
        xhr.send()
      })

      await flushEvents()

      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/ok'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.graphql).toBeUndefined()
    })

  createTest('should warn when using Request object with body stream')
    .withRum({
      allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload: true }],
      enableExperimentalFeatures: ['graphql_tracking'],
    })
    .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs, browserName }) => {
      await page.evaluate(() => {
        const request = new Request('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query GetUser { user { name } }',
            operationName: 'GetUser',
          }),
        })

        return window.fetch(request)
      })

      await flushEvents()

      withBrowserLogs((logs) => {
        if (browserName === 'firefox' || browserName === 'msedge') {
          // These browsers don’t surface the warning in logs
          expect(logs).toHaveLength(0)
        } else {
          const warningLog = logs.find((log) =>
            log.message.includes('GraphQL tracking does not support Request objects with body streams.')
          )
          expect(warningLog).toBeDefined()
        }
      })

      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/graphql'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.graphql).toBeUndefined()
    })
})
