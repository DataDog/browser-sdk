import {wildcardMatch} from "./wildcard";
import {RumActionEvent} from "@datadog/browser-rum-core/src";

// Represents a RumActionEvent where all the undefined have been resolved
export interface ActionEvent {
    application: string;
    actionType: string;
    actionName: string;
    viewName: string;
    viewUrl: string;
    selector: string;
}

// Maps an ActionEvent to a tracking-event
// the ActionEvent has been flattened into the structure to
// simplify its JSON representation
export interface ActionMapEntry {
    // src
    action: ActionEvent;
    // dest
    keep: boolean;
    trackingEventView: string;
    trackingEventName: string;
}

// a compiled ActionMapEntry, meaning the matchers have been resolved
export interface CompiledEntry {
    entry: ActionMapEntry;
    matchApplication: (x: string) => boolean;
    matchActionType: (x: string) => boolean;
    matchActionName: (x: string) => boolean;
    matchViewName: (x: string) => boolean;
    matchViewUrl: (x: string) => boolean;
    matchSelector: (x: string) => boolean;
}

export function newActionMapEntry(e: ActionEvent, keep: boolean, trackingEventView: string, trackingEventName: string): ActionMapEntry {
    return {
        action: e,
        keep: keep,
        trackingEventView: trackingEventView,
        trackingEventName: trackingEventName,
    };
}

export function isActionMapEntry(x: any): x is ActionMapEntry {
    const e = x as ActionMapEntry;
    if (e.action == undefined) {
        return false;
    }
    const action = e.action as ActionEvent;
    return action.application !== undefined &&
        action.actionType !== undefined &&
        action.actionName !== undefined &&
        action.viewName !== undefined &&
        action.viewUrl !== undefined &&
        action.selector !== undefined &&
        e.keep !== undefined &&
        e.trackingEventView !== undefined &&
        e.trackingEventName !== undefined;
}

export function matchOne(a: CompiledEntry, b: ActionEvent): boolean {
    return a.matchApplication(b.application) &&
        a.matchActionType(b.actionType) &&
        a.matchActionName(b.actionName) &&
        a.matchViewName(b.viewName) &&
        a.matchViewUrl(b.viewUrl) &&
        a.matchSelector(b.selector);
}

export function firstMatch(compiledEntries: CompiledEntry[], event: ActionEvent): number {
    for (let ix = 0; ix < compiledEntries.length; ++ix) {
        if (matchOne(compiledEntries[ix], event)) {
            return ix;
        }
    }
    return -1;
}

export function compileEntry(x: ActionMapEntry): CompiledEntry {
    return {
        entry: x,
        matchApplication: wildcardMatch(x.action.application),
        matchActionType: wildcardMatch(x.action.actionType),
        matchActionName: wildcardMatch(x.action.actionName),
        matchViewName: wildcardMatch(x.action.viewName),
        matchViewUrl: wildcardMatch(x.action.viewUrl),
        matchSelector: wildcardMatch(x.action.selector),
    }
}

export function parseActionMapEntryFromJson(json: string): ActionMapEntry[] {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
        throw new SyntaxError("not an array");
    }
    return parsed.map((x): ActionMapEntry => {
        if (!isActionMapEntry(x)) {
            throw new SyntaxError("not an ActionMapEntry");
        }
        return x as ActionMapEntry;
    });
}

export class ActionMap {
    entries: ActionMapEntry[];
    compiledEntries: CompiledEntry[];

    constructor(entries: ActionMapEntry[]) {
        this.entries = entries;
        this.compiledEntries = entries.map(compileEntry);
    }

    find(e: ActionEvent): number {
        return firstMatch(this.compiledEntries, e);
    }

    add(entry: ActionMapEntry): ActionMap {
        return new ActionMap([...this.entries, entry]);
    }
}

export function packTrackingEventPath(...steps: string[]): string {
    return steps.map(x => x.trim()).filter(x => x.length > 0).join("/")
}

export function unpackTrackingEventPath(path: string): string[] {
    return path.split('/').filter(x => x.length > 0);
}
