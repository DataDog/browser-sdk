# Flagging

This SDK is based on the Open Feature spec.

## Initialize

```
import DatadogProvider from '@datadog/openfeature-browser-provider'
import { OpenFeature } from '@openfeature/web-sdk'

...

## need to pass other information to the datadog provider, like:
* base url

subject information
* attributes

const user = { user_id: 'user_id' }

// Initialize the Datadog Provider
const devcycleProvider = new DatadogProvider('<DATADOG_CLIENT_TOKEN>') # application id too

// Set the context before the provider is set to ensure the Datadog SDK is initialized with a user context.
await OpenFeature.setContext(user)

// Set the DevCycleProvider for OpenFeature
await OpenFeature.setProviderAndWait(devcycleProvider)

// Get the OpenFeature client
const openFeatureClient = OpenFeature.getClient()
```

## Perform evaluation

```
// Retrieve a boolean flag from the OpenFeature client
const boolFlag = openFeatureClient.getBooleanValue('boolean-flag', false)
```
