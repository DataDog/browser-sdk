# Heavy SPA Benchmark - Datadog Web UI

A complex, JavaScript-heavy single-page application built with React + TypeScript for performance benchmarking and profiling of Datadog Browser SDK.

## Overview

This application simulates a realistic Datadog web UI to benchmark RUM performance, particularly for profiling overhead analysis. It includes performance throttling mechanisms to create realistic poor performance scenarios for testing.

## Pages

- 📊 **Dashboard** – Displays metrics cards, charts, and a service grid using Recharts. Triggering CLS due to multiple large dataset fetches.
- 📝 **Logs Explorer** – Provides log search, filtering, and a virtualized table with 2,000 logs.
- 🖥️ **Infrastructure** – Visualizes a host map and table with 3,000 hosts, where heavy DOM manipulation causes INP delays during filtering or interaction.
- ⚙️ **Settings** – Manages user and team settings with form submissions.

## Performance metrics target

Target to have Web Vitals in the “Needs improvement” score range.

- **LCP**: ~3000ms
- **CLS**: ~0.13
- **INP**: ~300ms
- **TBT**: ~45000ms

## Technology Stack

- **React 18** + **TypeScript** - UI framework
- **Vite** - Build tool
- **React Router v6** - Client-side routing
- **Recharts** - Data visualization
- **react-window** - List virtualization

## Getting Started

### Prerequisites

- Node.js 20+ (recommended)
- Yarn (uses Yarn by default)

### Installation

```bash
# Install dependencies
yarn install
```

### Development

```bash
# Run development server (opens browser automatically)
yarn dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
# Create production build (includes TypeScript compilation)
yarn build

# Preview production build
yarn preview
```
