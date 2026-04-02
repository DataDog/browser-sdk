# Session Design

## Context

With deterministic sampling, the session system simplifies dramatically compared to the legacy SDK. There is no state machine, no tracking types, and no product-specific state in the session. The session always has an ID — products derive their sampling decisions deterministically from it (e.g., `hash(sessionId) % 100 < sampleRate`). This means a given session ID always produces the same sampling result for each product.

## Design

### Session identity

Two identities managed by the session:

- **Session ID** — always present when active. Renewed on expiry. Products derive sampling decisions deterministically from it.
- **Device ID** — long-lived, persists across sessions. Generated once, stored permanently.

### Session lifecycle

A session is either **active** or **expired**. No intermediate states.

- **Active** — has a session ID, `created` timestamp, and `lastActivity` timestamp.
- **Expired** — 4h max age reached OR 15m since last activity. No session ID available.

Renewal happens automatically on user activity after expiry.

### Expiry rules

| Rule       | Duration   | Trigger                   |
| ---------- | ---------- | ------------------------- |
| Max age    | 4 hours    | Time since `created`      |
| Inactivity | 15 minutes | Time since `lastActivity` |

Activity is reported externally (browser-core hooks DOM events). The session itself just tracks timestamps and checks expiry.

### Pluggable storage

`core-next` defines a `SessionStore` interface. The environment provides the implementation:

```ts
interface SessionStore {
  get(): SessionState | undefined
  set(state: SessionState): void
  clear(): void
}
```

`browser-core` provides cookie, localStorage, and memory implementations. Cross-tab synchronization is browser-specific and not part of `core-next`.

### Session class

```ts
class Session {
  constructor(store: SessionStore) {}

  getId(): string | undefined // undefined when expired
  getDeviceId(): string
  isExpired(): boolean
  touch(): void // update lastActivity
  renew(): void // create new session
  expire(): void // force expiry
}
```

The session emits signals via the `EventEmitter`:

- `expired` — session has expired
- `renewed` — new session started

### What is NOT in `core-next`

- Cross-tab synchronization (browser-specific polling)
- Cookie/localStorage/memory storage implementations
- Sampling logic (products derive it deterministically from the session ID)
- Tracking types (removed — products decide independently)
- Activity detection (DOM events — browser-specific)

### Relationship with other domains

- **Configuration** — `sessionSampleRate` is not a session concern. Products read it and derive sampling from the session ID.
- **Transport** — `enabled: false` does not affect session. They are independent.
- **Telemetry** — session ID is provided via context provider: `telemetry.registerContext(() => ({ sessionId: session.getId() }))`
- **Enrichers** — a session enricher reads from the session and adds `sessionId` to observations
