# rc-bundle-lambda

An AWS Lambda (written in Rust) that serves customized [Datadog Browser SDK](https://github.com/DataDog/browser-sdk) bundles based on a customer's Remote Config (RC).

## Goal

Instead of serving a one-size-fits-all SDK bundle, this lambda:

1. Fetches the customer's Remote Config.
2. Fetches the Browser SDK source code.
3. Builds a trimmed bundle with disabled features (e.g. `trackUserInteractions: false`, `sessionReplaySampleRate: 0`) tree-shaken out using.
4. Returns both the optimized bundle and the RC payload in a single response — avoiding an extra round-trip from the client to fetch its config.

The lambda should be served behind CloudFront to improve performance.

## Environment variables

| Variable | Description |
|---|---|
| `SDK_CACHE_PATH` | Optional. Path to a local `.tar.gz` file used as a cache to avoid hitting the GitHub API during development and tests. |
| `RUST_LOG` | Optional. Log level filter (e.g. `info`, `debug`). Defaults to `INFO`. |

## Development

### Prerequisites

- Rust (stable)
- [cargo-lambda](https://www.cargo-lambda.info/) (`cargo install cargo-lambda`)

### Run locally

```sh
SDK_CACHE_PATH=target/sdk-cache.tar.gz cargo lambda watch
```

The function is then available at `http://localhost:9000/`. Use `curl` or similar to test it.

### Test

```sh
cargo test
```

This will run both inline unit tests within source files and the integration tests in `tests/integration.rs`.

Each integration test starts its own `cargo lambda watch` process on a free port, invokes the lambda, and checks that the response is valid JavaScript with no TypeScript type annotations.

> **Note:** The first run will fetch the SDK tarball from GitHub (~2.5 MB). Subsequent runs reuse the cached file at `target/sdk-cache.tar.gz`.

Show output even for passing tests (useful for seeing timing traces):

```sh
cargo test --test integration -- --nocapture
```
