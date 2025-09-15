import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

test.describe('GraphQL tracking', () => {
  createTest('track GraphQL query via XHR and include payload')
    .withRum({ allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload: true }] })
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
    .withRum({ allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload: false }] })
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
    .withRum({ allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload: true }] })
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
    .withRum({ allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload: true }] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const consoleMessages: string[] = []
      page.on('console', (msg) => {
        consoleMessages.push(msg.text())
      })

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
      expect(consoleMessages).toContain(
        'Datadog Browser SDK: GraphQL tracking does not support Request objects with body streams.'
      )

      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/graphql'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.graphql).toBeUndefined()
    })
})
