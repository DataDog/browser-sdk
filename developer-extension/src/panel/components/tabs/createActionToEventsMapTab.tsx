import {useDisclosure} from '@mantine/hooks';
import {TextInput, Badge, Button, Divider, Flex, Modal, Space, Switch, Table, Text, Textarea} from '@mantine/core'
import React, {useState} from 'react'
import {
    ActionEvent,
    ActionMap,
    ActionMapEntry,
    newActionMapEntry,
    packTrackingEventPath, unpackTrackingEventPath,
} from "../../hooks/useEvents/trackingEvents";
import {rumToActionEvent,} from "../../hooks/useEvents/rumToActionEvent";
import {tryCompileWildcardMatch} from "../../hooks/useEvents/wildcard";
import type {SdkEvent} from "../../sdkEvent";
import {formatDate} from "../../formatNumber";
import type {RumActionEvent} from "@datadog/browser-rum-core/src";

interface MapEventsTabProps {
    sdkEvents: SdkEvent[]
    setSdkEvents: (x: SdkEvent[]) => void
    clearEvents: () => void
    actionMap: ActionMap
    setActionMap: (x: ActionMap) => void,
    currentTrackingEventPath0: string,
    setCurrentTrackingEventPath0: (x: string) => void,
    currentTrackingEventPath1: string,
    setCurrentTrackingEventPath1: (x: string) => void,
    currentTrackingEventPath2: string,
    setCurrentTrackingEventPath2: (x: string) => void,
    currentTrackingEventPath3: string,
    setCurrentTrackingEventPath3: (x: string) => void,
    currentTrackingEventPath4: string,
    setCurrentTrackingEventPath4: (x: string) => void,
}

interface RumOrTrackingEvent {
    isActionEvent: boolean
    date: number
    actionType: string
    selector: string | undefined
    viewName: string | undefined
    viewUrl: string | undefined
    actionEvent(): ActionEvent
    trackingEvent(): ActionMapEntry
    trackingEventPos: number
    sdkEventPos: number
}

export function CreateActionToEventsMapTab({
                                               sdkEvents,
                                               setSdkEvents,
                                               clearEvents,
                                               actionMap,
                                               setActionMap,
                                               currentTrackingEventPath0,
                                               setCurrentTrackingEventPath0,
                                               currentTrackingEventPath1,
                                               setCurrentTrackingEventPath1,
                                               currentTrackingEventPath2,
                                               setCurrentTrackingEventPath2,
                                               currentTrackingEventPath3,
                                               setCurrentTrackingEventPath3,
                                               currentTrackingEventPath4,
                                               setCurrentTrackingEventPath4,
}: MapEventsTabProps) {
    const [modalOpened, {open, close}] = useDisclosure(false);
    const [showCustomEvents, setShowCustomEvents] = useState<boolean>(true);
    const [showSkippedEvents, setShowSkippedEvents] = useState<boolean>(false);

    const allEvents = sdkEvents.map((x, sdkEventPos) => {
        if (x.type != "action") {
            return undefined;
        }
        const rumEvent = x as RumActionEvent;
        const actionEvent = rumToActionEvent(rumEvent);
        const trackingEventPos = actionMap.find(actionEvent);
        if (trackingEventPos < 0) {
            if (!showCustomEvents && actionEvent.actionType == "custom") {
                return undefined;
            }
            const res: RumOrTrackingEvent = {
                isActionEvent: true,
                date: rumEvent.date,
                actionType: actionEvent.actionType,
                selector: actionEvent.selector,
                viewName: actionEvent.viewName,
                viewUrl: actionEvent.viewUrl,
                actionEvent(): ActionEvent {
                    return actionEvent;
                },
                trackingEvent(): ActionMapEntry {
                    throw Error("action event, not a tracking event");
                },
                trackingEventPos: -1,
                sdkEventPos: sdkEventPos,
            };
            return res;
        } else {
            const trackingEvent = actionMap.entries[trackingEventPos]
            if (!trackingEvent.keep && !showSkippedEvents) {
                return undefined;
            }
            const res: RumOrTrackingEvent = {
                isActionEvent: false,
                date: rumEvent.date,
                actionType: "tracking-event",
                selector: trackingEvent.action.selector,
                viewName: trackingEvent.action.viewName,
                viewUrl: trackingEvent.action.viewUrl,
                actionEvent(): ActionEvent {
                    throw Error("tracking event, not an action event");
                },
                trackingEvent(): ActionMapEntry {
                    return trackingEvent;
                },
                trackingEventPos: trackingEventPos,
                sdkEventPos: sdkEventPos,
            }
            return res;
        }
    }).filter(x => x).map(x => x as RumOrTrackingEvent).sort((a, b) => {
        return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });

    // src
    const [activeEvent, setActiveEvent] = useState<ActionEvent | null>(null)
    const [entryActionType, setEntryActionType] = useState<string>("")
    const [entryActionName, setEntryActionName] = useState<string>("")
    const [entryViewName, setEntryViewName] = useState<string>("")
    const [entryViewUrl, setEntryViewUrl] = useState<string>("")
    const [entrySelector, setEntrySelector] = useState<string>("")
    // dst
    const [entryKeep, setEntryKeep] = useState<boolean>(false);

    const openCreateEntryModal = (
        event: ActionEvent,
        keep: boolean,
        entryTrackingEventView: string | undefined,
        entryTrackingEventName: string | undefined,
    ) => {
        if (event.viewUrl.length == 0) {
            setEntryViewUrl("*")
        } else {
            const parsedViewUrl = URL.parse(event.viewUrl)
            if (parsedViewUrl) {
                if (parsedViewUrl.pathname == event.viewName) {
                    setEntryViewUrl("*")
                } else {
                    setEntryViewUrl("*" + parsedViewUrl.pathname + "*")
                }
            } else {
                setEntryViewUrl("*")
            }
        }
        setActiveEvent(event)
        setEntryActionType(event.actionType)
        setEntryActionName(event.actionName)
        setEntryViewName(event.viewName)
        setEntrySelector(event.selector)
        setEntryKeep(keep)
        if (entryTrackingEventView) {
            setCurrentTrackingEventPath0(entryTrackingEventView)
        }
        if (entryTrackingEventName) {
            const steps = unpackTrackingEventPath(entryTrackingEventName)
            if (steps.length > 0) {
                setCurrentTrackingEventPath1(steps[0])
            }
            if (steps.length > 1) {
                setCurrentTrackingEventPath2(steps[1])
            }
            if (steps.length > 2) {
                setCurrentTrackingEventPath3(steps[2])
            }
            if (steps.length > 3) {
                setCurrentTrackingEventPath4(steps[3])
            }
        }
        open()
    }

    const addActionMapEntry = (e: ActionMapEntry) => {
        setActionMap(actionMap.add(e));
    }

    const createTag = () => {
        if (!activeEvent) {
            return
        }
        /*
        if (entryKeep && ((entryTrackingEventView.trim().length == 0) || entryTrackingEventName.trim().length == 0)) {
            alert("You need to enter a tracking event view and name, or skip the entry");
            return;
        }
         */
        const entryTrackingEventName = packTrackingEventPath(currentTrackingEventPath1, currentTrackingEventPath2, currentTrackingEventPath3, currentTrackingEventPath4);
        const entry = newActionMapEntry(activeEvent, entryKeep, currentTrackingEventPath0.trim(), entryTrackingEventName);
        entry.action.actionType = entryActionType;
        entry.action.actionName = entryActionName;
        entry.action.viewName = entryViewName;
        entry.action.viewUrl = entryViewUrl;
        entry.action.selector = entrySelector;
        addActionMapEntry(entry);

        setActiveEvent(null)
        setEntryActionType("")
        setEntryActionName("")
        setEntryViewName("")
        setEntrySelector("")
        setEntryKeep(false)
        close();
    }

    const checkPattern = (pattern: string, value: string | undefined) => {
        if (!value) {
            return "(?)"
        }
        const compiled = tryCompileWildcardMatch(pattern)
        if (!compiled) {
            return "(FAILED to make regex)"
        }
        return compiled(value) ? "(√)" : "(X)"
    }

    return (
        <>
            <Modal opened={modalOpened} onClose={close} title="Map to Tracking Event">
                <div>
                    <Switch
                        label="Keep"
                        checked={entryKeep}
                        onChange={(x) => setEntryKeep(x.currentTarget.checked)}
                    />
                    <Divider my="xs" label="Tracking Event Path" labelPosition="left" />
                    <TextInput
                        placeholder="Tracking Event Path 0"
                        value={currentTrackingEventPath0}
                        onChange={(x) => setCurrentTrackingEventPath0(x.target.value)}
                    />
                    <TextInput
                        placeholder="Tracking Event Path 1"
                        value={currentTrackingEventPath1}
                        onChange={(x) => setCurrentTrackingEventPath1(x.target.value)}
                    />
                    <TextInput
                        placeholder="Tracking Event Path 2"
                        value={currentTrackingEventPath2}
                        onChange={(x) => setCurrentTrackingEventPath2(x.target.value)}
                    />
                    <TextInput
                        placeholder="Tracking Event Path 3"
                        value={currentTrackingEventPath3}
                        onChange={(x) => setCurrentTrackingEventPath3(x.target.value)}
                    />
                    <TextInput
                        placeholder="Tracking Event Path 4"
                        value={currentTrackingEventPath4}
                        onChange={(x) => setCurrentTrackingEventPath4(x.target.value)}
                    />
                    <Divider my="xs" label="Matchers" labelPosition="left" />
                    <Textarea
                        size="xs"
                        minRows={1} maxRows={1}
                        label={`Action Type ${checkPattern(entryActionType, activeEvent?.actionType)}`}
                        placeholder="Action Type ..."
                        value={entryActionType}
                        onChange={(x) => setEntryActionType(x.target.value)}
                    />
                    <Textarea
                        size="xs"
                        minRows={1} maxRows={1}
                        label={`View Name ${checkPattern(entryViewName, activeEvent?.viewName)}`}
                        placeholder="View Name ..."
                        value={entryViewName}
                        onChange={(x) => setEntryViewName(x.target.value)}
                    />
                    <Textarea
                        size="xs"
                        minRows={1} maxRows={1}
                        label={`View Url ${checkPattern(entryViewUrl, activeEvent?.viewUrl)}`}
                        placeholder="View Url ..."
                        value={entryViewUrl}
                        onChange={(x) => setEntryViewUrl(x.target.value)}
                    />
                    <Textarea
                        size="xs"
                        minRows={1} maxRows={1}
                        label={`Action Name ${checkPattern(entryActionName, activeEvent?.actionName)}`}
                        placeholder="Action Name ..."
                        value={entryActionName}
                        onChange={(x) => setEntryActionName(x.target.value)}
                    />
                    <Textarea
                        size="xs"
                        minRows={1} maxRows={4}
                        label={`Selector ${checkPattern(entrySelector, activeEvent?.selector)}`}
                        placeholder="selector ..."
                        value={entrySelector}
                        onChange={(x) => setEntrySelector(x.target.value)}
                    />
                    <Space h="md"/>
                    <Button size="compact-xs" onClick={createTag}>Create</Button>
                </div>
            </Modal>
            <Flex
                gap="xs"
                justify="flex-start"
                align="flex-start"
            >
                <Text>count: {allEvents.length}</Text>
                <Button size="compact-xs" onClick={clearEvents}>Clear Events</Button>
                <Switch
                    label="show Custom Events"
                    checked={showCustomEvents}
                    onChange={(x) => setShowCustomEvents(x.currentTarget.checked)}
                />
                <Switch
                    label="show Skipped Events"
                    checked={showSkippedEvents}
                    onChange={(x) => setShowSkippedEvents(x.currentTarget.checked)}
                />
            </Flex>
            <Table>
                <Table.Tbody>
                    {allEvents.map((e, ix) => EventRow(e, ix, openCreateEntryModal, actionMap, setActionMap, sdkEvents, setSdkEvents))}
                </Table.Tbody>
            </Table>
        </>
    )
}

function EventRow(
    event: RumOrTrackingEvent,
    ix: number,
    openCreateEntryModal: (
        event: ActionEvent,
        keep: boolean,
        entryTrackingEventView: string | undefined,
        entryTrackingEventName: string | undefined
    ) => void,
    actionMap: ActionMap,
    setActionMap: (x: ActionMap) => void,
    sdkEvents: SdkEvent[],
    setSdkEvents: (x: SdkEvent[]) => void,
) {
    return (
        <Table.Tr key={`action-${ix}`}>
            <Table.Td key={`action-${ix}-date`}>
                <div>
                    {formatDate(event.date)}
                    {displayEventType(event)}
                    {eventButtons(event, ix, openCreateEntryModal, actionMap, setActionMap, sdkEvents, setSdkEvents)}
                </div>
            </Table.Td>
            <Table.Td key={`action-${ix}-map`}>
            </Table.Td>
            <Table.Td key={`action-${ix}-details`}>
                <div>
                    {displayName(event)}
                    <Text size="xs" lineClamp={1}>
                        {event.viewName}
                    </Text>
                    <Text size="xs" lineClamp={1}>
                        {displayUrl(event.viewUrl, event.viewName)}
                    </Text>
                    {displaySelector(event.selector)}
                </div>
            </Table.Td>
        </Table.Tr>
    )
}

function displayEventType(event: RumOrTrackingEvent) {
    if (event.isActionEvent) {
        return (
            <Text size="xs" lineClamp={1}>
                {event.actionType}
            </Text>
        )
    } else {
        return (
            <Badge color="gray" size="xs">tracking</Badge>
        )
    }
}

function eventButtons(
    event: RumOrTrackingEvent,
    ix: number,
    openCreateEntryModal: (
        event: ActionEvent,
        keep: boolean,
        entryTrackingEventView: string | undefined,
        entryTrackingEventName: string | undefined
    ) => void,
    actionMap: ActionMap,
    setActionMap: (x: ActionMap) => void,
    sdkEvents: SdkEvent[],
    setSdkEvents: (x: SdkEvent[]) => void,
) {
    if (event.isActionEvent) {
        return (
            <Flex gap="xs">
                <Button key={`action-${ix}-map-tag`} size="compact-xs" color="green"
                        onClick={() => openCreateEntryModal(event.actionEvent(), true, undefined, undefined)}>
                    tag
                </Button>
                <Button key={`action-${ix}-map-skip`} size="compact-xs" color="red"
                        onClick={(_) => openCreateEntryModal(event.actionEvent(), false, undefined, undefined)}>
                    skip
                </Button>
            </Flex>
        )
    } else {
        return (
            <Flex gap="xs">
                <Button key={`action-${ix}-map-edit`} size="compact-xs" color="blue"
                        onClick={() => openCreateEntryModal(event.trackingEvent().action, true, event.trackingEvent().trackingEventView, event.trackingEvent().trackingEventName)}>
                    edit
                </Button>
                <Button key={`action-${ix}-map-drop`} size="compact-xs" color="orange" onClick={(_) => {
                    const entries = [...actionMap.entries]
                    entries.splice(event.trackingEventPos, 1)
                    setActionMap(new ActionMap(entries))
                }}>
                    drop
                </Button>
            </Flex>
        )
    }
}

function displayName(event: RumOrTrackingEvent) {
    if (event.isActionEvent) {
        return <Text size="xs" lineClamp={1}>{event.actionEvent().actionName}</Text>
    } else {
        return (
            <div>
                <Badge color="gray" size="xs">{event.trackingEvent().trackingEventView}</Badge>
                <Badge color="gray" size="xs">{event.trackingEvent().trackingEventName}</Badge>
            </div>
        )
    }
}

function displaySelector(selector: string | undefined) {
    if (!selector) {
        return null;
    }
    const headMaxSize = 30;
    const tailMaxSize = 30;
    if (selector.length <= headMaxSize) {
        return (
            <Text size="xs" lineClamp={1}>{selector}</Text>
        );
    }
    const tailStart = Math.max(headMaxSize, selector.length - tailMaxSize);
    return (
        <div>
            <Text size="xs" lineClamp={1}>{selector.substring(0, headMaxSize)}...</Text>
            <Text size="xs" lineClamp={1}>...{selector.substring(tailStart)}</Text>
        </div>
    );
}

function displayUrl(url: string | undefined, name: string | undefined): string {
    if (!url) {
        return "."
    }
    const parsed = URL.parse(url)
    if (!parsed) {
        return url
    }
    if (name != parsed.pathname) {
        return parsed.pathname
    } else {
        return "."
    }
}
/*
                    <Textarea
                        size="xs"
                        minRows={1}
                        label="Tracking Event View"
                        placeholder="Tracking Event View ..."
                        value={entryTrackingEventView}
                        onChange={(x) => setTrackingEventView(x.target.value)}
                        disabled={!entryKeep}
                    />
                    <Textarea
                        size="xs"
                        minRows={1}
                        label="Tracking Event Name"
                        placeholder="Tracking Event Name ..."
                        value={entryTrackingEventName}
                        onChange={(x) => setTrackingEventName(x.target.value)}
                        disabled={!entryKeep}
                    />

 */