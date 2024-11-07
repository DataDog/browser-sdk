import {Table} from '@mantine/core'
import React from 'react'
import {ActionMap, ActionMapEntry} from "../../hooks/useEvents/trackingEvents";
import {TabBase} from '../tabBase'

import * as classes from './trackingEvents.module.css'

interface TrackingEventsTabProps {
    actionMap: ActionMap | undefined
}

export function TrackingEventsTab({
                                      actionMap
                                  }: TrackingEventsTabProps) {
    if (!actionMap) {
        return null
    }
    return (
        <TabBase>
            <Table stickyHeader>
                <Table.Thead className={classes.root}>
                    <Table.Tr>
                        <Table.Th>Keep</Table.Th>
                        <Table.Th>Tracking Event</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>View</Table.Th>
                        <Table.Th className={classes.nameCell}>Name</Table.Th>
                        <Table.Th className={classes.selectorCell}>Selector</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {actionMap.entries.reverse().map((e) => ActionMapEntryRow(e))}
                </Table.Tbody>
            </Table>
        </TabBase>
    )
}

function ActionMapEntryRow(
    entry: ActionMapEntry
) {
    return (
        <Table.Tr>
            <Table.Td>{entry.keep ? "Keep" : "Skip"}</Table.Td>
            <Table.Td>{entry.trackingEvent}</Table.Td>
            <Table.Td>{entry.actionType}</Table.Td>
            <Table.Td>{entry.view}</Table.Td>
            <Table.Td className={classes.nameCell}>{entry.name}</Table.Td>
            <Table.Td className={classes.selectorCell}>{entry.selector}</Table.Td>
        </Table.Tr>
    )
}
