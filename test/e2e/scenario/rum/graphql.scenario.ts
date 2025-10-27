import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

function buildGraphQlConfig({ trackPayload = false }: { trackPayload?: boolean } = {}) {
  return {
    allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload }],
  }
}

test.describe('GraphQL tracking', () => {
  createTest('track GraphQL query via XHR and include payload')
    .withRum(buildGraphQlConfig({ trackPayload: true }))
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
    .withRum(buildGraphQlConfig())
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
    .withRum(buildGraphQlConfig({ trackPayload: true }))
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
})
