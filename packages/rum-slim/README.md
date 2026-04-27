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
- starts and updates views automatically by polling `window.location.pathname`
- disables request collection, runtime error collection, and view metrics by design

The Salesforce wrapper should only load the bundle and initialize RUM once. The bundle emits the
initial view during `init()` and starts a lightweight pathname watcher to emit route-change views.

[1]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client/?tab=rum#initialization-parameters:~:text=compressIntakeRequests
