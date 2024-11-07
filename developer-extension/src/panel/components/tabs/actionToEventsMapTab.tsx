import {Button, Table, Text} from '@mantine/core'
import React from 'react'
import {ActionMap, ActionMapEntry} from "../../hooks/useEvents/trackingEvents";
import {TabBase} from '../tabBase'

interface TrackingEventsTabProps {
    actionMap: ActionMap,
    setActionMap: (x: ActionMap) => void,
}

export function ActionToEventsMapTab({
                                      actionMap,
                                      setActionMap,
                                  }: TrackingEventsTabProps) {
    return (
        <div>
            <Text>count: {actionMap.entries.length}</Text>
            <TabBase>
                <Table stickyHeader>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>X</Table.Th>
                            <Table.Th>Keep</Table.Th>
                            <Table.Th>Tk View</Table.Th>
                            <Table.Th>Tk Name</Table.Th>
                            <Table.Th>Type</Table.Th>
                            <Table.Th>ViewName</Table.Th>
                            <Table.Th>ViewUrl</Table.Th>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Selector</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {actionMap.entries.map((e, ix) =>
                            ActionMapEntryRow(
                                e, ix,
                                actionMap, setActionMap,
                            ))
                        }
                    </Table.Tbody>
                </Table>
            </TabBase>
        </div>
    )
}

function ActionMapEntryRow(
    entry: ActionMapEntry,
    ix: number,
    actionMap: ActionMap,
    setActionMap: (x: ActionMap) => void,
) {
    return (
        <Table.Tr key={`action-map-entry-${ix}`}>
            <Table.Td key={`action-map-entry-${ix}-drop`}>
                <Button size="compact-xs" color="red" onClick={(clickEvt) => {
                    const entries = [...actionMap.entries]
                    entries.splice(ix, 1)
                    setActionMap(new ActionMap(entries))
                }}
                >Drop</Button>
            </Table.Td>
            <Table.Td key={`action-map-entry-${ix}-keep`}>{entry.keep ? "Keep" : "Skip"}</Table.Td>
            <Table.Td key={`action-map-entry-${ix}-tracking-view`}>{entry.trackingEventView}</Table.Td>
            <Table.Td key={`action-map-entry-${ix}-tracking-name`}>{entry.trackingEventName}</Table.Td>
            <Table.Td key={`action-map-entry-${ix}-type`}>{entry.action.actionType}</Table.Td>
            <Table.Td key={`action-map-entry-${ix}-view-name`}>{entry.action.viewName}</Table.Td>
            <Table.Td key={`action-map-entry-${ix}-view-url`}>{entry.action.viewUrl}</Table.Td>
            <Table.Td key={`action-map-entry-${ix}-name`}>{entry.action.actionName}</Table.Td>
            <Table.Td key={`action-map-entry-${ix}-selector`}>{entry.action.selector}</Table.Td>
        </Table.Tr>
    )
}
