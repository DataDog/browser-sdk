/* eslint-disable import/no-default-export */
/* eslint-disable local-rules/disallow-side-effects */
import type * as clientSdk from './index.client'
import { datadogRumAstro } from './integration'

export * from './index.client'
export * from './index.server'

export declare function init(options?: clientSdk.RumInitConfiguration): void

export default datadogRumAstro
