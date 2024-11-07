import {RumActionEvent} from "@datadog/browser-rum-core/src";
import {ActionEvent} from "./trackingEvents";

export function rumToActionEvent(e: RumActionEvent): ActionEvent {
    const selector = e?._dd?.action?.target?.selector
    const name = e.action.target?.name
    return {
        application: e.application.id,
        actionType: e.action.type,
        actionName: name ? name : "",
        viewName: e.view.name ? e.view.name : "",
        viewUrl: e.view.url ? e.view.url : "",
        selector: selector ? selector : "",
    };
}
