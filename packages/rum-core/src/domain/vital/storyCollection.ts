import type { ClocksState, Context, Duration } from '@datadog/browser-core'
import { clocksNow, elapsed, generateUUID, combine, toServerDuration } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RawRumUserStoryEvent } from '../../rawRumEvent.types'
import { RumEventType, VitalType, UserStoryStatus } from '../../rawRumEvent.types'

export interface StoryOptions {
  context?: Context
  description?: string
}

export interface StoryReference {
  __dd_story_reference: true
}

interface StoryStart {
  name: string
  startClocks: ClocksState
  storyInstanceId: string
  context?: Context
  description?: string
}

interface StoriesState {
  storiesByName: Map<string, StoryStart>
  storiesByReference: WeakMap<StoryReference, StoryStart>
}

export function createStoriesState(): StoriesState {
  return {
    storiesByName: new Map(),
    storiesByReference: new WeakMap(),
  }
}

function buildUserStoryEvent(
  storyStart: StoryStart,
  status: UserStoryStatus,
  stopOptions: StoryOptions,
  duration: Duration
): RawRumUserStoryEvent {
  return {
    date: storyStart.startClocks.timeStamp,
    type: RumEventType.VITAL,
    vital: {
      id: generateUUID(),
      name: storyStart.name,
      type: VitalType.USER_STORY,
      description: stopOptions.description ?? storyStart.description,
      duration: toServerDuration(duration),
      story_instance_id: storyStart.storyInstanceId,
      status,
    },
    _dd: {
      vital: {
        computed_value: true,
      },
    },
  }
}

export function startStoryCollection(lifeCycle: LifeCycle, storiesState: StoriesState) {
  function startStory(name: string, options: StoryOptions = {}) {
    const storyInstanceId = generateUUID()
    const storyStart: StoryStart = {
      name,
      startClocks: clocksNow(),
      storyInstanceId,
      context: options.context,
      description: options.description,
    }
    const reference: StoryReference = { __dd_story_reference: true }
    storiesState.storiesByName.set(name, storyStart)
    storiesState.storiesByReference.set(reference, storyStart)
    // Emit IN_PROGRESS event with duration 0
    const event = buildUserStoryEvent(storyStart, UserStoryStatus.IN_PROGRESS, options, 0 as Duration)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent: event,
      startTime: storyStart.startClocks.relative,
      duration: 0 as Duration,
      customerContext: storyStart.context,
      domainContext: {},
    })
    return reference
  }

  function stopStory(nameOrRef: string | StoryReference, options: StoryOptions = {}) {
    const storyStart = typeof nameOrRef === 'string'
      ? storiesState.storiesByName.get(nameOrRef)
      : storiesState.storiesByReference.get(nameOrRef)
    if (!storyStart) {
      return
    }
    const stopClocks = clocksNow()
    const duration = elapsed(storyStart.startClocks.timeStamp, stopClocks.timeStamp)
    const event = buildUserStoryEvent(storyStart, UserStoryStatus.SUCCESS, options, duration)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent: event,
      startTime: storyStart.startClocks.relative,
      duration,
      customerContext: combine(storyStart.context, options.context),
      domainContext: {},
    })
    if (typeof nameOrRef === 'string') {
      storiesState.storiesByName.delete(nameOrRef)
    } else {
      storiesState.storiesByReference.delete(nameOrRef)
    }
  }

  function failStory(nameOrRef: string | StoryReference, options: StoryOptions = {}) {
    const storyStart = typeof nameOrRef === 'string'
      ? storiesState.storiesByName.get(nameOrRef)
      : storiesState.storiesByReference.get(nameOrRef)
    if (!storyStart) {
      return
    }
    const stopClocks = clocksNow()
    const duration = elapsed(storyStart.startClocks.timeStamp, stopClocks.timeStamp)
    const event = buildUserStoryEvent(storyStart, UserStoryStatus.FAILURE, options, duration)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent: event,
      startTime: storyStart.startClocks.relative,
      duration,
      customerContext: combine(storyStart.context, options.context),
      domainContext: {},
    })
    if (typeof nameOrRef === 'string') {
      storiesState.storiesByName.delete(nameOrRef)
    } else {
      storiesState.storiesByReference.delete(nameOrRef)
    }
  }

  return {
    startStory,
    stopStory,
    failStory,
  }
} 