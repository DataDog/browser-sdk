import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

function buildGraphQlConfig({
  trackPayload = false,
  trackResponseErrors = false,
}: {
  trackPayload?: boolean
  trackResponseErrors?: boolean
} = {}) {
  return {
    allowedGraphQlUrls: [{ match: (url: string) => url.includes('graphql'), trackPayload, trackResponseErrors }],
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
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.url.includes('/graphql'))!
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
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.url.includes('/graphql'))!
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

      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.url.includes('/ok'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.graphql).toBeUndefined()
    })

  createTest('track GraphQL response errors via fetch')
    .withRum(buildGraphQlConfig({ trackPayload: false, trackResponseErrors: true }))
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() =>
        window.fetch('/graphql?scenario=validation-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query GetUser { user { unknownField } }',
            operationName: 'GetUser',
          }),
        })
      )

      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.url.includes('/graphql'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.graphql).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: undefined,
        payload: undefined,
        errors_count: 1,
        errors: [
          {
            message: 'Field "unknownField" does not exist',
            code: 'GRAPHQL_VALIDATION_FAILED',
            locations: [{ line: 2, column: 5 }],
            path: ['user', 'unknownField'],
          },
        ],
      })
    })

  createTest('track GraphQL response with multiple errors via XHR')
    .withRum(buildGraphQlConfig({ trackResponseErrors: true }))
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/graphql?scenario=multiple-errors')
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.send(
          JSON.stringify({
            query: 'query GetUser { user { name } }',
          })
        )
      })

      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.url.includes('/graphql'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.graphql?.errors_count).toBe(2)
      expect(resourceEvent.resource.graphql?.errors).toEqual([
        { message: 'User not found' },
        { message: 'Insufficient permissions', code: 'UNAUTHORIZED' },
      ])
    })

  createTest('should not track response errors when trackResponseErrors is false')
    .withRum(buildGraphQlConfig({ trackPayload: true, trackResponseErrors: false }))
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() =>
        window.fetch('/graphql?scenario=validation-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query Test { test }',
          }),
        })
      )

      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.url.includes('/graphql'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.graphql?.errors_count).toBeUndefined()
      expect(resourceEvent.resource.graphql?.errors).toBeUndefined()
    })
})
