# RUM Browser Monitoring - React integration

This package provides React and React ecosystem integrations for Datadog Browser RUM.

See the [dedicated Datadog documentation][1] for more details.

## React Router Support

### React Router v6

For React Router v6 (using react-router-dom), import from the default v6 path:

```javascript
import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v6'
```

### React Router v7

For React Router v7 (which consolidates react-router-dom into react-router), import from the dedicated v7 path:

```javascript
import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v7'
```

The v7 entry point correctly imports from `react-router` instead of `react-router-dom`, supporting the new unified package structure in React Router v7.

[1]: https://docs.datadoghq.com/integrations/rum_react
