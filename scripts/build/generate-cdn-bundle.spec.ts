/**
 * CDN Bundle Generator CLI Tests
 *
 * Tests for the CLI entry point and integration tests for the full generation flow.
 * Uses Node.js built-in test runner (node:test).
 */

import { describe, it, mock, beforeEach } from 'node:test'
import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const CLI_PATH = './scripts/build/generate-cdn-bundle.ts'

/**
 * Helper to run the CLI with given arguments
 */
function runCLI(args: string[]): { stdout: string; stderr: string; exitCode: number | null } {
  const result = spawnSync('npx', ['tsx', CLI_PATH, ...args], {
    encoding: 'utf-8',
    timeout: 30000,
  })

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
  }
}

describe('CLI argument validation', () => {
  it('shows help with --help flag', () => {
    const result = runCLI(['--help'])

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0')
    assert.ok(result.stdout.includes('Usage:'), 'Should show usage information')
    assert.ok(result.stdout.includes('--applicationId'), 'Should list applicationId option')
    assert.ok(result.stdout.includes('--configId'), 'Should list configId option')
    assert.ok(result.stdout.includes('--variant'), 'Should list variant option')
  })

  it('shows help with -h flag', () => {
    const result = runCLI(['-h'])

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0')
    assert.ok(result.stdout.includes('Usage:'), 'Should show usage information')
  })

  it('exits with error when missing required arguments', () => {
    const result = runCLI([])

    assert.strictEqual(result.exitCode, 1, 'Should exit with code 1')
    assert.ok(result.stdout.includes('Missing required arguments'), 'Should indicate missing arguments')
    assert.ok(result.stdout.includes('--applicationId'), 'Should list missing applicationId')
    assert.ok(result.stdout.includes('--configId'), 'Should list missing configId')
    assert.ok(result.stdout.includes('--variant'), 'Should list missing variant')
  })

  it('exits with error when only applicationId is provided', () => {
    const result = runCLI(['--applicationId', 'test-app'])

    assert.strictEqual(result.exitCode, 1, 'Should exit with code 1')
    assert.ok(result.stdout.includes('--configId'), 'Should list missing configId')
    assert.ok(result.stdout.includes('--variant'), 'Should list missing variant')
  })

  it('exits with error when invalid variant is provided', () => {
    const result = runCLI(['--applicationId', 'test-app', '--configId', 'test-config', '--variant', 'invalid-variant'])

    assert.strictEqual(result.exitCode, 1, 'Should exit with code 1')
    assert.ok(result.stdout.includes('Invalid variant'), 'Should indicate invalid variant')
    assert.ok(result.stdout.includes('rum') && result.stdout.includes('rum-slim'), 'Should suggest valid variants')
  })

  it('accepts valid rum variant', () => {
    // This will fail at fetch stage, but validates variant was accepted
    const result = runCLI(['--applicationId', 'test-app', '--configId', 'invalid-config-id', '--variant', 'rum'])

    // Should fail with exit code 2 (network/runtime error), not 1 (validation error)
    assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 for runtime error')
    assert.ok(!result.stdout.includes('Invalid variant'), 'Should not show invalid variant error')
  })

  it('accepts valid rum-slim variant', () => {
    // This will fail at fetch stage, but validates variant was accepted
    const result = runCLI(['--applicationId', 'test-app', '--configId', 'invalid-config-id', '--variant', 'rum-slim'])

    // Should fail with exit code 2 (network/runtime error), not 1 (validation error)
    assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 for runtime error')
    assert.ok(!result.stdout.includes('Invalid variant'), 'Should not show invalid variant error')
  })

  it('accepts short flags', () => {
    // This will fail at fetch stage, but validates short flags are parsed
    const result = runCLI(['-a', 'test-app', '-c', 'invalid-config-id', '-v', 'rum'])

    // Should fail with exit code 2 (network/runtime error), not 1 (validation error)
    assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 for runtime error')
  })
})

describe('error handling', () => {
  it('provides helpful error message for invalid config ID', () => {
    const result = runCLI([
      '--applicationId',
      'test-app',
      '--configId',
      'definitely-not-a-valid-config-id',
      '--variant',
      'rum',
    ])

    assert.strictEqual(result.exitCode, 2, 'Should exit with code 2')
    assert.ok(
      result.stdout.includes('Failed to fetch') || result.stdout.includes('Error') || result.stdout.includes('error'),
      'Should show error message'
    )
  })
})

describe('output format', () => {
  // Note: These tests require mocking or a real config ID to fully test
  // For now, we verify the output structure expectations

  it('includes progress messages when generating', () => {
    const result = runCLI(['--applicationId', 'test-app', '--configId', 'test-config', '--variant', 'rum'])

    // First step should show "Fetching remote configuration..."
    assert.ok(result.stdout.includes('Fetching remote configuration'), 'Should show fetching message')
  })
})

describe('integration: generateCombinedBundle output validation', () => {
  // These tests verify that the generated output is valid JavaScript
  // without requiring actual network calls

  it('generated bundle template produces valid JavaScript', async () => {
    const { generateCombinedBundle } = await import('./lib/bundleGenerator.ts')

    const bundle = generateCombinedBundle({
      sdkCode: `
        window.DD_RUM = window.DD_RUM || {};
        window.DD_RUM.init = function(config) {
          console.log('DD_RUM initialized with', config);
        };
      `,
      config: {
        applicationId: 'test-app-id',
        sessionSampleRate: 100,
        service: 'test-service',
        env: 'test',
      },
      variant: 'rum',
    })

    // Verify it's valid JavaScript
    assert.doesNotThrow(() => {
      new Function(bundle)
    }, 'Generated bundle should be valid JavaScript')

    // Verify structure
    assert.ok(bundle.includes('Datadog Browser SDK'), 'Should have header comment')
    assert.ok(bundle.includes('(function()'), 'Should be wrapped in IIFE')
    assert.ok(bundle.includes('__DATADOG_REMOTE_CONFIG__'), 'Should define config variable')
    assert.ok(bundle.includes('DD_RUM.init'), 'Should call init')
  })

  it('generated bundle executes without error in simulated browser environment', async () => {
    const { generateCombinedBundle } = await import('./lib/bundleGenerator.ts')

    const bundle = generateCombinedBundle({
      sdkCode: `
        (function() {
          window.DD_RUM = window.DD_RUM || {};
          window.DD_RUM.init = function(config) {
            window.DD_RUM._config = config;
          };
        })();
      `,
      config: {
        applicationId: 'exec-test-app',
        sessionSampleRate: 50,
      },
      variant: 'rum',
    })

    // Simulate browser environment
    const mockWindow = {
      DD_RUM: undefined as unknown,
    }

    // Create a function that executes the bundle with our mock window
    const executeBundle = new Function('window', bundle)

    assert.doesNotThrow(() => {
      executeBundle(mockWindow)
    }, 'Bundle should execute without throwing')

    // Verify the SDK was "initialized" with our config
    assert.ok(mockWindow.DD_RUM !== undefined, 'DD_RUM should be defined after bundle execution')
  })
})
