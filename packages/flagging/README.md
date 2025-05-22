# Flagging SDK (Prerelease)

This package supports flagging and experimentation by performing evaluation in the browser.

## Initialize

```
const datadogFlaggingProvider = createDatadogProvider()

// provide the subject
const subject = {
  key: 'subject-key-1',
}
await OpenFeature.setContext(subject)

// initialize
await OpenFeature.setProviderAndWait(datadogFlaggingProvider)
```

## Evaluation

```
const client = OpenFeature.getClient()

// provide the flag key and a default value which is returned for exceptional conditions.
const flagEval = client.getBooleanValue('<FLAG_KEY>', false)
```
