import { dateNow } from '../../tools/timeUtils'
import type { TimeStamp } from '../../tools/timeUtils'

interface Simulation {
  start: TimeStamp
  end: TimeStamp
  label: string
}

let simulation: Simulation | undefined

export function initSimulation(simulationStart?: string, simulationEnd?: string, simulationLabel?: string) {
  if (simulationStart && simulationEnd && simulationLabel) {
    simulation = {
      start: new Date(simulationStart).getTime() as TimeStamp,
      end: new Date(simulationEnd).getTime() as TimeStamp,
      label: simulationLabel,
    }
  }
}

export function isSimulationActive() {
  const now = dateNow()
  return simulation !== undefined && now >= simulation.start && now <= simulation.end
}

export function getSimulationLabel() {
  return simulation?.label
}
