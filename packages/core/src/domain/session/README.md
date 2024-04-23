## possible states:

| state                   | value                                                        |
| ----------------------- | ------------------------------------------------------------ |
| NotStarted<sup>\*</sup> | `{}`                                                         |
| Expired                 | `{expired: '1'}` or `expire >  15 minutes` or `created > 4H` |
| Tracked                 | `{id: 'xxxx-xx-xx}`                                          |
| NotTracked              | `{rum: 0}` or `{logs: 0}`                                    |

(<sup>\*</sup>) `NotStarted` is a state that can happen in a few different ways:

- First load of the page if there is no cookie present already
- After the cookie has been deleted by a 3rd party (user, ad blocker, ...)
- After the cookie has expired (it is deleted by the browser)

Other terminology:

- A _started_ session is a session that is either `Expired`, `Tracked`, or `NotTracked`.
- An _active_ session is a session that is either `Tracked` or `NotTracked`.

## start session

```mermaid
stateDiagram-v2
state fork_state <<fork>>
state fork_state2 <<fork>>

[*] --> fork_state

fork_state --> NotStarted
fork_state --> Expired
fork_state --> Tracked
fork_state --> NotTracked
NotStarted --> Expired: startSession()

Expired --> fork_state2
Tracked --> fork_state2
NotTracked --> fork_state2
fork_state2 --> [*]: expandOrRenew()
```

## On User Activity

```mermaid
stateDiagram-v2
state fork_state <<fork>>

[*] --> fork_state

fork_state --> [*]: expandOrRenew()
```

## On Visibility Change

```mermaid
stateDiagram-v2
state fork_state <<fork>>
state visibility <<choice>>

[*] --> visibility: VisibilityChange

visibility --> [*]: hidden
visibility --> fork_state : visible

fork_state --> [*]: extendOrExpire()
```

## On resume from frozen state

```mermaid
stateDiagram-v2
state fork_state <<fork>>
state fork_state2 <<fork>>

[*] --> fork_state: Resume

fork_state --> NotStarted
fork_state --> Expired
fork_state --> Tracked
fork_state --> NotTracked

NotStarted --> Expired: restartSession()
Expired --> fork_state2
Tracked --> fork_state2
NotTracked --> fork_state2

fork_state2 --> [*]: extendOrExpire()
```

## Watch (every second)

```mermaid
stateDiagram-v2
state fork_state <<fork>>


[*] --> fork_state
fork_state --> [*]: extendOrExpire()
```

## 3rd party cookie clearing

```mermaid
stateDiagram-v2
state fork_state <<fork>>
state join_state <<join>>
NotStarted2: NotStarted

[*] --> fork_state

fork_state --> NotStarted
fork_state --> Expired
fork_state --> Tracked
fork_state --> NotTracked

Expired --> join_state
Tracked --> join_state
NotTracked --> join_state
NotStarted --> join_state

join_state --> NotStarted2 : clearCookies()

NotStarted2 --> [*]
```

## Expand Or Renew

```mermaid
stateDiagram-v2
state fork_state <<fork>>
state fork_state2 <<fork>>
state fork_state3 <<fork>>


state expandOrRenew() {
  [*] --> fork_state: expandOrRenew()
  Tracked2: Tracked
  NotTracked2: NotTracked

  fork_state --> NotStarted
  fork_state --> Expired
  fork_state --> Tracked
  fork_state --> NotTracked

  NotStarted --> [*]

  Expired --> fork_state2: renew()
  Tracked --> fork_state2: extend()
  NotTracked --> fork_state2: extend()

  fork_state2 --> fork_state3: computeTrackingType()

  fork_state3 --> Tracked2
  fork_state3 --> NotTracked2

  Tracked2 --> [*]
  NotTracked2 --> [*]
}
```

> [!NOTE]  
> Because `computeTrackingType()` happens at every `expandOrRenew()`, it is in theory possible to switch from `Tracked` to `NotTracked` and vice versa within an active session. However, this is not expected to happen in practice at this time.

## Extend Or Expire

```mermaid
stateDiagram-v2
state fork_state <<fork>>

state extendOrExpire() {
  [*] --> fork_state : extendOrExpire()
  Tracked2: Tracked
  NotTracked2: NotTracked
  Expired2: Expired

  fork_state --> NotStarted
  fork_state --> Expired
  fork_state --> Tracked
  fork_state --> NotTracked

  Tracked --> Tracked2: extend()
  NotTracked --> NotTracked2: extend()
  Expired --> Expired2: expire()

  NotStarted --> [*]
  Tracked2 --> [*]
  NotTracked2 --> [*]
  Expired2 --> [*]
}
```

> [!NOTE]  
> Because a session time out can result in an `Expired` state, `expire()` explicitly normalizes the state to `isExpired=1`
