import { Message } from "../../logger/logger.module";
import { monitor } from "../../monitoring/monitoring";
import { Context } from "../context";
import { HttpTransport } from "./httpTransport";

export class Batch {
  private buffer: string[] = [];
  private bufferBytesSize = 0;

  constructor(
    private transport: HttpTransport,
    private maxSize: number,
    private bytesLimit: number,
    private contextProvider: () => Context
  ) {}

  add(message: Message) {
    const { processedMessage, messageBytesSize } = this.process(message);
    if (this.willReachedBytesLimitWith(messageBytesSize)) {
      this.flush();
    }
    this.push(processedMessage, messageBytesSize);
    if (this.isFull()) {
      this.flush();
    }
  }

  flush() {
    if (this.buffer.length !== 0) {
      this.transport.send(this.buffer);
      this.buffer = [];
      this.bufferBytesSize = 0;
    }
  }

  private process(message: Message) {
    const processedMessage = JSON.stringify({ ...message, ...this.contextProvider() });
    const messageBytesSize = sizeInBytes(processedMessage);
    return { processedMessage, messageBytesSize };
  }

  private push(processedMessage: string, messageBytesSize: number) {
    this.buffer.push(processedMessage);
    this.bufferBytesSize += messageBytesSize;
  }

  private willReachedBytesLimitWith(messageBytesSize: number) {
    // n + 1 elements, n bytes of separator
    const separatorsBytesSize = this.buffer.length;
    return this.bufferBytesSize + messageBytesSize + separatorsBytesSize >= this.bytesLimit;
  }

  private isFull() {
    return this.buffer.length === this.maxSize;
  }
}

function sizeInBytes(candidate: string) {
  // tslint:disable-next-line no-bitwise
  return ~-encodeURI(candidate).split(/%..|./).length;
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
