# React Shopist - Lightweight E-Commerce App

A lightweight React-based e-commerce application for performance benchmarking and profiling of Datadog Browser SDK.

## Pages

- 🛍️ **Product Listing** – Displays product grid with category filtering and search functionality.
- 📦 **Product Detail** – Shows detailed product information with add-to-cart interactions.
- 🛒 **Shopping Cart** – Manages cart items with quantity updates and checkout flow.

## Performance metrics target

Target to have Web Vitals in the "Good" score range.

- **LCP**: ~1000ms
- **CLS**: ~0.05ms
- **INP**: ~60ms
- **TBT**: ~0ms

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

The app will be available at `http://localhost:3002`

### Building for Production

```bash
# Create production build (includes TypeScript compilation)
yarn build

# Preview production build
yarn preview
```
