import { ONE_SECOND } from '@datadog/browser-core'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { Click } from './trackClickActions'

const MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE = 3

export function computeFrustration(clicks: Click[], rageClick: Click) {
  if (isRage(clicks)) {
    rageClick.addFrustration(FrustrationType.RAGE_CLICK)
    if (clicks.some(isDead)) {
      rageClick.addFrustration(FrustrationType.DEAD_CLICK)
    }
    if (rageClick.hasError) {
      rageClick.addFrustration(FrustrationType.ERROR_CLICK)
    }
    return { isRage: true }
  }

  const hasSelectionChanged = clicks.some((click) => click.getUserActivity().selection)
  clicks.forEach((click) => {
    if (click.hasError) {
      click.addFrustration(FrustrationType.ERROR_CLICK)
    }
    if (
      isDead(click) &&
      // Avoid considering clicks part of a double-click or triple-click selections as dead clicks
      !hasSelectionChanged
    ) {
      click.addFrustration(FrustrationType.DEAD_CLICK)
    }
  })
  return { isRage: false }
}

export function isRage(clicks: Click[]) {
  if (clicks.some((click) => click.getUserActivity().selection)) {
    return false
  }
  for (let i = 0; i < clicks.length - (MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE - 1); i += 1) {
    if (
      clicks[i + MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE - 1].event.timeStamp - clicks[i].event.timeStamp <=
      ONE_SECOND
    ) {
      return true
    }
  }
  return false
}

export function isDead(click: Click) {
  return !click.hasPageActivity && !click.getUserActivity().input
}
