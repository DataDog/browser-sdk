interface ActionContexts {
  getCurrentActionIds(): string[]
}

function actionContextEnricher(actionContexts: ActionContexts) {
  return {
    name: 'actionContext',
    transform(data: Record<string, unknown>) {
      const type = data.type as string
      if (type !== 'error' && type !== 'resource' && type !== 'long_task') {
        return data
      }
      const ids = actionContexts.getCurrentActionIds()
      if (ids.length === 0) return data
      return {
        ...data,
        action: { id: ids },
      }
    },
  }
}

export { actionContextEnricher }
export type { ActionContexts }
