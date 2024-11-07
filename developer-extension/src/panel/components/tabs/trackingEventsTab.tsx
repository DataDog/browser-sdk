import {Flex, Table, Text} from '@mantine/core'
import React from 'react'
import {rumToActionEvent} from "../../hooks/useEvents/rumToActionEvent";
import {TabBase} from '../tabBase'
import type {SdkEvent} from "../../sdkEvent";
import {formatDate} from "../../formatNumber";
import type {RumActionEvent} from "@datadog/browser-rum-core/src";
import {ActionMap, ActionMapEntry} from "../../hooks/useEvents/trackingEvents";

interface TrackingEventsTabProps {
    events: SdkEvent[]
    actionMap: ActionMap
}

interface Entry {
    rumEvent: RumActionEvent,
    trackingEvent: ActionMapEntry,
}

export function TrackingEventsTab({
                                 events,
                                 actionMap,
                             }: TrackingEventsTabProps) {
    const trackingEvents = events.map(x => {
        if (x.type != "action") {
            return undefined;
        }
        const rumEvent = x as RumActionEvent;
        const actionEvent = rumToActionEvent(rumEvent);
        const trackingEventPos = actionMap.find(actionEvent);
        if (trackingEventPos < 0) {
            return undefined;
        }
        const trackingEvent = actionMap.entries[trackingEventPos]
        if (!trackingEvent.keep) {
            return undefined;
        }
        const entry: Entry = {
            rumEvent: rumEvent,
            trackingEvent: trackingEvent,
        }
        return entry;
    }).filter(x => x).map(x => x as Entry);
    return (
        <>
            <Text>count: {trackingEvents.length}</Text>
            <Table stickyHeader>
                <Table.Tbody>
                    {trackingEvents.map((e, ix) => TrackingEventRow(e, ix))}
                </Table.Tbody>
            </Table>
        </>
    )
}

function TrackingEventRow(entry: Entry, ix: number) {
    return (
        <Table.Tr key={`action-${ix}`}>
            <Table.Td key={`action-${ix}-date`}>{formatDate(entry.rumEvent.date)}</Table.Td>
            <Table.Td key={`action-${ix}-name`}>
                <Flex>
                    <Text size="xs">{entry.trackingEvent.trackingEventView}</Text>
                    <Text size="xs">{entry.trackingEvent.trackingEventName}</Text>
                </Flex>
            </Table.Td>
            <Table.Td key={`action-${ix}-view`}>
                <div>
                    <Text size="xs">{entry.trackingEvent.action.viewName}</Text>
                    <Text size="xs">{entry.trackingEvent.action.viewUrl}</Text>
                </div>
            </Table.Td>
        </Table.Tr>
    )
}