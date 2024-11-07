import {useEffect, useRef, useState} from 'react'
import type {SdkEvent} from '../../sdkEvent'
import type {EventCollectionStrategy} from '../../../common/extension.types'
import type {EventFilters} from './eventFilters'
import {applyEventFilters, DEFAULT_FILTERS} from './eventFilters'
import type {EventCollection} from './eventCollection'
import {startEventCollection} from './eventCollection'
import {ActionMap} from "./trackingEvents";

const MAXIMUM_DISPLAYED_EVENTS = 100

export function useEvents({
                              preserveEvents,
                              eventCollectionStrategy,
                          }: {
    preserveEvents: boolean
    eventCollectionStrategy: EventCollectionStrategy
}) {
    const [events, setEvents] = useState<SdkEvent[]>([])
    const [filters, setFilters] = useState<EventFilters>(DEFAULT_FILTERS)
    const [actionMap, setActionMapRaw] = useState<ActionMap>(new ActionMap([]))
    const [actionMapJson, setActionMapJsonRaw] = useState<string>(JSON.stringify(actionMap.entries, null, 2))
    const [actionMapJsonUrl, setActionMapJsonUrlRaw] = useState<string>("http://localhost:8181/")
    const [actionMapJsonSync, setActionMapJsonSync] = useState<boolean>(false)

    const exportActionMapJson = (url: string, json: string) => {
        if (actionMapJsonSync) {
            console.log('POST action map');
            fetch(url, {
                    method: 'POST',
                    body: json,
                    headers: {'Content-Type': 'application/json; charset=UTF-8'}
                }
            ).then(response => {
                console.log('Response status:', response.status);
            }).catch(error => {
                console.error('Error sending POST request:', error);
            });
        }
    }

    const importActionMapJson = (url: string): string => {
        const request = new XMLHttpRequest();
        request.open('GET', url, false);
        request.send();
        if (request.status === 200) {
            return request.responseText;
        } else {
            throw Error(`HTTP error! status: ${request.status}`);
        }
    }

    const setActionMapJson = (json: string) => {
        setActionMapJsonRaw(json);
        exportActionMapJson(actionMapJsonUrl, json);
    }

    const setActionMapJsonUrl = (url: string) => {
        setActionMapJsonUrlRaw(url);
        exportActionMapJson(url, actionMapJson);
    }

    const setActionMap = (x: ActionMap) => {
        setActionMapRaw(x);
        setActionMapJson(JSON.stringify(x.entries, null, 2));
    }

    const eventCollectionRef = useRef<EventCollection>()

    function clearEvents() {
        eventCollectionRef.current?.clear()
    }

    useEffect(() => {
        const eventCollection = startEventCollection(eventCollectionStrategy, setEvents)
        eventCollectionRef.current = eventCollection
        return () => eventCollection.stop()
    }, [eventCollectionStrategy])

    useEffect(() => {
        if (!preserveEvents) {
            const clearCurrentEvents = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
                if (details.transitionType === 'reload' && details.tabId === chrome.devtools.inspectedWindow.tabId) {
                    clearEvents()
                }
            }
            chrome.webNavigation.onCommitted.addListener(clearCurrentEvents)
            return () => {
                chrome.webNavigation.onCommitted.removeListener(clearCurrentEvents)
            }
        }
    }, [preserveEvents])

    const eventCollection = eventCollectionRef.current;
    const facetRegistry = eventCollection?.facetRegistry
    return {
        events: facetRegistry
            ? applyEventFilters(filters, events, facetRegistry).slice(0, MAXIMUM_DISPLAYED_EVENTS)
            : events,
        setEvents,
        filters, setFilters,
        clear: clearEvents,
        facetRegistry,
        actionMap, setActionMap,
        actionMapJson, setActionMapJson,
        actionMapJsonUrl, setActionMapJsonUrl,
        actionMapJsonSync, setActionMapJsonSync,
        importActionMapJson
    }
}
