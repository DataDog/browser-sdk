# RUM Browser Monitoring - slim package

## Overview

This package is equivalent to the [RUM package](../rum), but without support for Session Replay
recording and the [`compressIntakeRequests`][1] initialization parameter.

## Setup

See the [RUM package](../rum/README.md) documentation.

## Salesforce bundle

The Salesforce bundle is a dedicated `rum-slim` build for Lightning / Experience Cloud wrappers
that:

- keeps the standard public API: `DD_RUM.init(...)` and `DD_RUM.startView(...)`
- forces manual view tracking
- disables request collection, runtime error collection, and view metrics by design

The Salesforce wrapper is responsible for observing route changes and calling `startView()` with the
normalized pathname and current URL.

[1]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client/?tab=rum#initialization-parameters:~:text=compressIntakeRequests
