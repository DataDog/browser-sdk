import { Message } from "../../logger/logger.module";
import { Context } from "../context";
import { HttpTransport } from "./httpTransport";

export class Batch {
  private buffer: Message[] = [];

  constructor(private transport: HttpTransport, private maxSize: number, private contextProvider: () => Context) {}

  add(message: Message) {
    this.buffer.push({ ...message, ...this.contextProvider() });
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
}
