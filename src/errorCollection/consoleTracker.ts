import { Logger } from "../core/logger/logger";

let original: (message?: any, ...optionalParams: any[]) => void;

export function startConsoleTracking(logger: Logger) {
  original = console.error;
  console.error = (message?: any, ...optionalParams: any[]) => {
    original.apply(console, [message, ...optionalParams]);
    logger.error([message, ...optionalParams].join(" "));
  };
}

export function stopConsoleTracking() {
  console.error = original;
}
