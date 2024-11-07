import {useDisclosure} from '@mantine/hooks';
import {CopyButton, Button, Input, Modal, Table} from '@mantine/core'
import React, {useState} from 'react'
import {ActionMap, sdkEventToActionMapEntry} from "../../hooks/useEvents/trackingEvents";
import {TabBase} from '../tabBase'
import type {SdkEvent} from "../../sdkEvent";
import {formatDate} from "../../formatNumber";
import type {RumActionEvent} from "@datadog/browser-rum-core/src";

import * as classes from './mapEvents.module.css'


interface MapEventsTabProps {
    events: SdkEvent[]
    setEvents: (events: SdkEvent[]) => void
    actionMap: ActionMap | undefined
}

export function MapEventsTab({
                                 events,
                                 setEvents,
                                 actionMap
                             }: MapEventsTabProps) {
    if (!actionMap) {
        return null
    }

    const [activeEvent, setActiveEvent] = useState<RumActionEvent | null>(null)
    const [tag, setTag] = useState("");
    const [modalOpened, {open, close}] = useDisclosure(false);

    return (
        <>
            <Modal opened={modalOpened} onClose={close} title="Tracking Events">
                <Input
                    placeholder="tracking event..."
                    value={tag}
                    onChange={(x) => {
                        setTag(x.target.value)
                    }}
                />
                <Button onClick={() => {
                    if (activeEvent && tag) {
                        actionMap.add(sdkEventToActionMapEntry(activeEvent, true, tag));
                        setEvents(actionMap.filter(events))
                    }
                    setTag("")
                    close()
                }}>Create</Button>
            </Modal>
            <TabBase>
                <Table stickyHeader>
                    <Table.Thead className={classes.root}>
                        <Table.Tr>
                            <Table.Th className={classes.dateCell}>Date</Table.Th>
                            <Table.Th className={classes.mapCell}>Map</Table.Th>
                            <Table.Th className={classes.typeCell}>Type</Table.Th>
                            <Table.Th className={classes.nameCell}>Name</Table.Th>
                            <Table.Th className={classes.selectorCell}>Selector</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {events.map((e) => EventRow(
                            e as RumActionEvent,
                            events,
                            setEvents,
                            actionMap,
                            setActiveEvent,
                            open
                        ))}
                    </Table.Tbody>
                </Table>
            </TabBase>
        </>
    )
}

function EventRow(
    event: RumActionEvent,
    events: SdkEvent[],
    setEvents: (events: SdkEvent[]) => void,
    actionMap: ActionMap,
    setActiveEvent: (x: RumActionEvent | null) => void,
    openModal: () => void
) {

    return (
        <Table.Tr>
            <Table.Td className={classes.dateCell}>{formatDate(event.date)}</Table.Td>
            <Table.Td className={classes.mapCell}>
                <div>
                    <Button color="red" onClick={(clickEvt) => {
                        actionMap.add(sdkEventToActionMapEntry(event, false, ""));
                        setEvents(actionMap.filter(events))
                    }}
                    >
                        skip
                    </Button>
                    <Button color="green" onClick={() => {
                        setActiveEvent(event)
                        openModal()
                    }}>Tag</Button>
                </div>
            </Table.Td>
            <Table.Td className={classes.typeCell}>{event.action.type}</Table.Td>
            <Table.Td className={classes.nameCell}>{event.action.target?.name}</Table.Td>
            <Table.Td className={classes.selectorCell}>{selector(event)}</Table.Td>
        </Table.Tr>
    )
}

function selector(event: RumActionEvent) {
    const selector = event._dd.action?.target?.selector;
    if (!selector) {
        return null;
    }
    const headMaxSize = 50;
    const tailMaxSize = 50;
    if (selector.length <= headMaxSize) {
        return (
            <div>{selector}</div>
        );
    }
    const tailStart = Math.max(headMaxSize, selector.length - tailMaxSize);
    return (
        <div>
            <div>{selector.substring(0, headMaxSize)}...</div>
            <div>...{selector.substring(tailStart)}</div>
        </div>
    );

}