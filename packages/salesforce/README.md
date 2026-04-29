# RUM Browser Monitoring - Salesforce package

## Overview

This package provides a Salesforce-specific bundle built from the regular
[`@datadog/browser-rum`](../rum) SDK.

The Salesforce bundle is dedicated to Lightning / Experience Cloud wrappers that:

- keep the standard public API: `DD_RUM.init(...)` and `DD_RUM.startView(...)`
- force manual view tracking
- start and update views automatically by polling `window.location.pathname`
- disable request collection, runtime error collection, and view metrics by design
- emit a single JavaScript bundle for Salesforce static resource loading

The Salesforce wrapper should only load the bundle and initialize RUM once. The bundle emits the
initial view during `init()` and starts a lightweight pathname watcher to emit route-change views.
