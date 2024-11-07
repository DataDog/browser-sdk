import {Button, Flex, Space, Switch, Textarea} from '@mantine/core'
import React from 'react'
import {ActionMap, parseActionMapEntryFromJson} from "../../hooks/useEvents/trackingEvents";

interface TrackingEventsJsonTabProps {
    actionMap: ActionMap
    setActionMap: (x: ActionMap) => void,
    actionMapJson: string
    setActionMapJson: (x: string) => void,
    actionMapJsonUrl: string
    setActionMapJsonUrl: (x: string) => void,
    actionMapJsonSync: boolean,
    setActionMapJsonSync: (x: boolean) => void,
    importActionMapJson: (url: string) => string
}

export function ActionToEventsMapJsonTab({
                                             actionMap,
                                             setActionMap,
                                             actionMapJson,
                                             setActionMapJson,
                                             actionMapJsonUrl,
                                             setActionMapJsonUrl,
                                             actionMapJsonSync,
                                             setActionMapJsonSync,
                                             importActionMapJson,
                                         }: TrackingEventsJsonTabProps) {

    const tryParseJsonToActionMap = (json: string): boolean => {
        try {
            const entries = parseActionMapEntryFromJson(json);
            setActionMap(new ActionMap(entries));
            return true;
        } catch (ex) {
            if (ex instanceof SyntaxError) {
                alert("failed to parse json: " + ex.message);
            } else {
                alert("failed to parse json: " + ex);
            }
            return false;
        }
    }

    return (
        <div>
            <Flex
                mih={50}
                gap="sm"
                justify="flex-start"
                align="flex-start"
                direction="row"
                wrap="wrap"
            >
                <Button onClick={() => {
                    if (tryParseJsonToActionMap(actionMapJson)) {
                        alert("successfully loaded");
                    }
                }}>Load</Button>
                <Switch
                    label="Sync"
                    checked={actionMapJsonSync}
                    onChange={(x) => {
                        const sync = x.currentTarget.checked;
                        if (sync) {
                            try {
                                const json = importActionMapJson(actionMapJsonUrl)
                                if (tryParseJsonToActionMap(json)) {
                                    setActionMapJsonSync(sync);
                                }
                            } catch (ex) {
                                alert("failed to import from " + actionMapJsonUrl)
                            }
                        } else {
                            setActionMapJsonSync(sync);
                        }
                    }}
                />
                <Textarea
                    placeholder="Sync with Url..."
                    value={actionMapJsonUrl}
                    onChange={(x) => setActionMapJsonUrl(x.target.value)}
                    resize="horizontal"
                    minRows={1} maxRows={1}
                />
            </Flex>
            <Space h="md" />
            <Textarea
                value={actionMapJson}
                autosize
                resize="vertical"
                onChange={(x) => setActionMapJson(x.target.value)}
            />
        </div>
    )
}
