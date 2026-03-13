import { generateCombinedBundle } from './packages/endpoint/src/bundleGenerator.ts'
import { resolveDynamicValues, serializeConfigToJs } from './packages/remote-config/src/entries/node.ts'
import { downloadSDK, getDefaultVersion } from './packages/endpoint/src/sdkDownloader.ts'

const APP_ID = 'd717cc88-ced7-4830-a377-14433a5c7bb0'
const RC_ID = 'e242d141-e05f-4814-981a-29e0c407050b'

// Fetch RC using native fetch (avoids browser-core's window.fetch wrapper)
const rcResp = await fetch(`https://sdk-configuration.browser-intake-datadoghq.com/v1/${RC_ID}.json`)
const rcJson = (await rcResp.json()) as { rum: Record<string, unknown> }
const rc = rcJson.rum

// Resolve dynamic values using the Node code-gen path
const resolved = resolveDynamicValues(rc)
const configJs = serializeConfigToJs(resolved)

// Download real SDK from CDN
const sdkCode = await downloadSDK({ variant: 'rum' })
const sdkVersion = getDefaultVersion()

const bundle = generateCombinedBundle({ sdkCode, configJs, variant: 'rum', sdkVersion })
process.stdout.write(bundle)
