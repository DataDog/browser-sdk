import {Textarea} from '@mantine/core'
import React from 'react'
import {ActionMap} from "../../hooks/useEvents/trackingEvents";

interface TrackingEventsJsonTabProps {
    actionMap: ActionMap | undefined
}

export function TrackingEventsJsonTab({
                                      actionMap
                                  }: TrackingEventsJsonTabProps) {
    if (!actionMap) {
        return null
    }
    return (
        <Textarea
            value={JSON.stringify(actionMap.entries, null, 2)}
            autosize
            resize="vertical"
        />
    )
}
