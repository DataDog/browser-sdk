# Heavy SPA Benchmark - Datadog Web UI

A complex, JavaScript-heavy single-page application built with React + TypeScript for performance benchmarking of Datadog Browser SDK features.

## Overview

Simulates a realistic Datadog web UI to benchmark RUM performance with 3-way profiling distribution:

- **Baseline (50%)** - No headers → `benchmark_variant:baseline`
- **Headers-only (25%)** - `?profiling=true&profiling_sample_rate=0` → `benchmark_variant:headers-only`
- **Full profiling (25%)** - `?profiling=true&profiling_sample_rate=100` → `benchmark_variant:full-profiling`

**Query in Datadog:**

```
@benchmark_variant:baseline
@benchmark_variant:headers-only
@benchmark_variant:full-profiling
```

## Features

- 📊 **Dashboard** - Metrics cards, charts, service grid
- 📝 **Logs Explorer** - Log search, filtering, and virtualized table
- 🔍 **APM Traces** - Trace list and flamegraph visualization
- 🖥️ **Infrastructure** - Host map and metrics
- ⚙️ **Settings** - User settings and team management

## Technology Stack

- **React 18** + **TypeScript** - UI framework
- **Vite** - Build tool
- **React Router v6** - Client-side routing
- **Recharts** - Data visualization
- **react-window** - List virtualization

## Getting Started

### Prerequisites

- Node.js 20+ (recommended)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Run development server
npm run dev
```

The app will be available at `http://localhost:5173`

### URL Parameters

Customize RUM configuration via URL params:

```
/?service=my-app&env=prod
/?profiling_sample_rate=100&session_replay_sample_rate=50
/?client_token=YOUR_TOKEN&application_id=YOUR_APP_ID
```

**Core params:**

- `client_token`, `application_id`, `site`, `service`, `version`, `env`

**Sampling params:**

- `profiling_sample_rate` (0-100, default: 50)
- `session_sample_rate` (0-100, default: 100)
- `session_replay_sample_rate` (0-100, default: 0)
- `telemetry_sample_rate` (0-100, default: 100)

### Building for Production

```bash
# Create production build
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
heavy-spa/
├── public/
│   └── data/              # Static JSON mock data
│       ├── metrics.json
│       ├── logs.json
│       ├── traces.json
│       └── infrastructure.json
├── src/
│   ├── components/
│   │   ├── Layout/        # Layout components (TopBar, Sidebar, MainLayout)
│   │   ├── Dashboard/     # Dashboard page components
│   │   ├── Logs/          # Logs Explorer components
│   │   ├── APM/           # APM Traces components
│   │   ├── Infrastructure/# Infrastructure components
│   │   ├── Settings/      # Settings components
│   │   └── Common/        # Shared/reusable components
│   ├── hooks/             # Custom React hooks (useData, useDebounce)
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions (API, constants)
│   ├── sdk-config.ts      # Datadog SDK initialization
│   ├── main.tsx           # Application entry point
│   └── App.tsx            # Root component with routing
├── index.html             # HTML entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## SDK Configuration

The SDK is loaded from CDN and initialized based on URL parameters:

- `sdk` - SDK mode (none, rum, rum-replay, rum-profiling)
- `client_token` - Datadog client token (required for rum modes)
- `application_id` - RUM application ID (required for rum modes)
- `site` - Datadog site (default: datadoghq.com)

Configuration is handled in `src/sdk-config.ts`.

## Performance Testing

This application is designed to stress-test the Browser SDK with:

- **Heavy DOM manipulation** - Multiple views with complex layouts
- **Data visualization** - Charts and graphs rendering
- **Large datasets** - Virtualized tables with 200+ rows
- **Frequent re-renders** - Interactive filtering and sorting
- **Client-side routing** - SPA navigation patterns

## Development Guidelines

### Adding New Components

1. Create component in appropriate directory under `src/components/`
2. Create corresponding CSS file
3. Export from component file
4. Import in parent component or route

### Adding New Routes

1. Add route path to `src/utils/constants.ts`
2. Create page component
3. Add route to `src/App.tsx`
4. Add navigation item to `src/components/Layout/Sidebar.tsx`

### Adding Mock Data

1. Create JSON file in `public/data/`
2. Add TypeScript interface in `src/types/data.ts`
3. Add path to `src/utils/constants.ts`
4. Use `useData` hook to fetch in components

## Troubleshooting

### TypeScript Errors

```bash
# Check TypeScript errors
npm run build
```

### SDK Not Initializing

- Check browser console for errors
- Verify `client_token` and `application_id` are provided
- Ensure SDK script is loaded (check Network tab)

### Port Already in Use

```bash
# Use different port
npm run dev -- --port 3000
```

## License

This project is part of the browser-sdk-test-playground repository.

## Related

- [Performance Benchmark RFC](../HEAVY_SPA_PLAN.md)
- [Browser SDK Documentation](https://docs.datadoghq.com/real_user_monitoring/browser/)
