import type { ActionIconProps, PolymorphicComponentProps } from '@mantine/core'
import { ActionIcon } from '@mantine/core'
import { default as clsx } from 'clsx'
import type { JSXElementConstructor } from 'react'
import React, { forwardRef } from 'react'
import * as classes from './rowButton.module.css'

type RowButtonProps = Omit<PolymorphicComponentProps<'button', ActionIconProps>, 'children'> & {
  icon: JSXElementConstructor<{ size: number; strokeWidth: number }>
}

export const RowButton = forwardRef<HTMLButtonElement, RowButtonProps>((props, ref) => (
  <ActionIcon ref={ref} {...props} variant="light" size="md" className={clsx(classes.root, props.className)}>
    <props.icon size={20} strokeWidth={1.5} />
  </ActionIcon>
))
