import {
  generateUUID,
  relativeToClocks,
  toServerDuration
} from "./chunk-HOS4BT2D.js";

// ../rum-core/src/domain/longTask/longTaskCollection.ts
function startLongTaskCollection(lifeCycle, configuration) {
  lifeCycle.subscribe(0 /* PERFORMANCE_ENTRIES_COLLECTED */, (entries) => {
    for (const entry of entries) {
      if (entry.entryType !== "longtask" /* LONG_TASK */) {
        break;
      }
      if (!configuration.trackLongTasks) {
        break;
      }
      const startClocks = relativeToClocks(entry.startTime);
      const rawRumEvent = {
        date: startClocks.timeStamp,
        long_task: {
          id: generateUUID(),
          entry_type: "long-task" /* LONG_TASK */,
          duration: toServerDuration(entry.duration)
        },
        type: "long_task" /* LONG_TASK */,
        _dd: {
          discarded: false
        }
      };
      lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, {
        rawRumEvent,
        startTime: startClocks.relative,
        domainContext: { performanceEntry: entry }
      });
    }
  });
}
export {
  startLongTaskCollection
};
