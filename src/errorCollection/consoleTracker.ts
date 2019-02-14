import { Logger } from "../logger/logger";

export function startConsoleTracking(logger: Logger) {
  console.error = (original => {
    const override = (message?: any, ...optionalParams: any[]) => {
      original.apply(console, [message, ...optionalParams]);
      logger.error([message, ...optionalParams].join(" "));
    };
    override.__original__ = original;
    return override;
  })(console.error);
}

export function stopConsoleTracking() {
  console.error = (console.error as any).__original__;
}
