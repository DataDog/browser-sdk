import { register } from '@shopify/web-pixels-extension'
import { display } from '@datadog/browser-core'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApiStub, makeProfilerApiStub } from '@datadog/browser-rum-slim/internal'
import { shopifyAppPixelPlugin } from '../domain/shopifyAppPixelPlugin'

