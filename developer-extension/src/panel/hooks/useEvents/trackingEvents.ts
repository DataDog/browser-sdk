import { type SdkEvent } from '../../sdkEvent'
import {RumActionEvent} from "@datadog/browser-rum-core/src";

export class ActionMapEntry {
  // src
  application: string;
  actionType: string;
  view?: string;
  selector?: string;
  name?: string;
  // dest
  keep: boolean;
  trackingEvent: string;

  constructor(
      application: string, actionType: string, view: string | undefined, selector: string | undefined, name: string | undefined,
      keep: boolean, trackingEvent: string
  ) {
    this.application = application;
    this.actionType = actionType;
    this.view = view;
    this.selector = selector;
    this.name = name;
    this.keep = keep;
    this.trackingEvent = trackingEvent;
  }

  sameSource(that: ActionMapEntry): boolean {
    return this.application == that.application &&
        this.actionType == that.actionType &&
        this.view == that.view &&
        this.selector == that.selector &&
        this.name == that.name;
  }
}

export function sdkEventToActionMapEntry(e: RumActionEvent, keep: boolean, trackingEvent: string): ActionMapEntry {
  return new ActionMapEntry(
      e.application.id,
      e.action.type,
      e.view.name,
      e?._dd?.action?.target?.selector,
      e.action.target?.name,
      keep,
      trackingEvent
  );
}

export class ActionMap {
  entries: ActionMapEntry[] = [];

  filterOne(e: SdkEvent): boolean {
    return e.type == "action" &&  this.find(e as RumActionEvent) == undefined;
  }

  filter(events: SdkEvent[]): SdkEvent[] {
    return events.filter( (e) => this.filterOne(e));
  }

  find(e: RumActionEvent): ActionMapEntry | undefined {
    return this._find(sdkEventToActionMapEntry(e, true, ""));
  }

  _find(entry: ActionMapEntry): ActionMapEntry | undefined {
    for (const x of this.entries) {
      if (x.sameSource(entry)) {
        return x;
      }
    }
    return undefined;
  }

  add(entry: ActionMapEntry): void {
    this.entries.push(entry);
  }

}
