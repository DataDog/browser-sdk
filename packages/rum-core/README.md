# `rum-core`

Datadog browser RUM core utilities.

## USER_STORY Vital API

The USER_STORY vital API allows you to track custom user journeys or business flows as distinct events in Datadog RUM. Each story is tracked with a unique instance ID and can be marked as in progress, successful, or failed.

### Usage

#### 1. Start a User Story

```js
const storyRef = DD_RUM.startStory('checkout', {
  description: 'User checkout flow',
  context: { step: 1 }
})
```
- Sends a `USER_STORY` vital event with status `IN_PROGRESS` and duration 0.
- Returns a reference to use for stopping or failing the story.

#### 2. Stop a User Story

```js
DD_RUM.stopStory(storyRef, {
  context: { step: 2 }
})
```
- Sends a `USER_STORY` vital event with status `SUCCESS` and the measured duration since start.

#### 3. Fail a User Story

```js
DD_RUM.failStory(storyRef, {
  context: { error: 'payment_failed' }
})
```
- Sends a `USER_STORY` vital event with status `FAILURE` and the measured duration since start.

#### 4. API by Name

You can also use the story name if you only have one active story per name:

```js
DD_RUM.startStory('checkout')
DD_RUM.stopStory('checkout')
```

### Event Fields

Each USER_STORY vital event includes:
- `name`: The story name you provided
- `story_instance_id`: Unique ID for this story instance (same for start/stop/fail)
- `status`: One of `IN_PROGRESS`, `SUCCESS`, `FAILURE`
- `duration`: 0 for start, measured for stop/fail
- `description` and `context`: If provided
- All standard RUM event context (view, session, etc.)

### Use Cases
- Track user journeys (e.g., checkout, onboarding)
- Measure business-critical flows
- Analyze success/failure rates and durations of key stories

These events are sent to Datadog and can be analyzed alongside other RUM events.
