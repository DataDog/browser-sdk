import { Message } from "../../logger/logger.module";
import { monitor } from "../../monitoring/monitoring";
import { Context } from "../context";
import { HttpTransport } from "./httpTransport";

export class Batch {
  private buffer: Message[] = [];

  constructor(
    private transport: HttpTransport,
    private maxSize: number,
    private bytesLimit: number,
    private contextProvider: () => Context
  ) {}

  add(message: Message) {
    const contextualizedMessage = { ...message, ...this.contextProvider() };
    if (this.willOverflowWith(contextualizedMessage)) {
      this.flush();
    }
    this.buffer.push(contextualizedMessage);
    if (this.buffer.length === this.maxSize) {
      this.flush();
    }
  }

  flush() {
    if (this.buffer.length !== 0) {
      this.transport.send(this.buffer);
      this.buffer = [];
    }
  }

  private willOverflowWith(message: Message) {
    return sizeInBytes(this.buffer) + sizeInBytes(message) > this.bytesLimit;
  }
}

function sizeInBytes(candidate: Message | Message[]) {
  // tslint:disable-next-line no-bitwise
  return ~-encodeURI(JSON.stringify(candidate)).split(/%..|./).length;
}

export function flushOnPageHide(batch: Batch) {
  /**
   * With sendBeacon, requests are guaranteed to be successfully sent during document unload
   */
  if (navigator.sendBeacon) {
    /**
     * Only event that guarantee to fire on mobile devices when the page transitions to background state
     * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
     */
    document.addEventListener(
      "visibilitychange",
      monitor(() => {
        if (document.visibilityState === "hidden") {
          batch.flush();
        }
      })
    );
    /**
     * Safari does not support yet to send a request during:
     * - a visibility change during doc unload (cf: https://bugs.webkit.org/show_bug.cgi?id=194897)
     * - a page hide transition (cf: https://bugs.webkit.org/show_bug.cgi?id=188329)
     */
    window.addEventListener("beforeunload", monitor(() => batch.flush()));
  }
}
