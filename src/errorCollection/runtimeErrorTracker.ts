import { Logger } from "../core/logger/logger";
import { report, StackTrace } from "../tracekit/tracekit";

let handler: (stack: StackTrace) => void;

export function startRuntimeErrorTracking(logger: Logger) {
  handler = (stack: StackTrace) => logger.error(stack.message, stack);
  report.subscribe(handler);
}

export function stopRuntimeErrorTracking() {
  report.unsubscribe(handler);
}
