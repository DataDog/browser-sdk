import React from 'react'
import { ReactRecorder } from './ReactRecorder'

function wrapChildrenWithRecorder(children: React.ReactNode) {
  return React.Children.map(children, (child) => {
    if (
      child === null ||
      child === undefined ||
      typeof child === 'string' ||
      typeof child === 'number' ||
      typeof child === 'boolean'
    ) {
      return child
    }

    let componentName = ''
    if ('displayName' in child) {
      componentName = child.displayName as string
    } else if ('name' in child) {
      componentName = child.name as string
    } else if ('type' in child && typeof child.type === 'function' && 'name' in child.type) {
      componentName = child.type.name
    } else {
      componentName = 'Component'
    }

    return (
      <ReactRecorder name={componentName}>
        {'props' in child ? wrapChildrenWithRecorder(child.props.children) : child}
      </ReactRecorder>
    )
  })
}

export const WithDatadogRecorder =
  <P extends object>(Component: React.ComponentType<P>) =>
  (props: P & { children: React.ReactNode }) => {
    const { children } = props

    return (
      <ReactRecorder
        name={
          'type' in Component && typeof Component.type === 'function' && 'name' in Component.type
            ? Component.type.name
            : 'Component'
        }
      >
        <Component {...props}>{wrapChildrenWithRecorder(children)}</Component>
      </ReactRecorder>
    )
  }
