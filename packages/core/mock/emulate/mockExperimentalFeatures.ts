import {
  resetExperimentalFeatures,
  type ExperimentalFeature,
  addExperimentalFeatures,
} from '../../src/tools/experimentalFeatures'
import { registerCleanupTask } from '../registerCleanupTask'

export function mockExperimentalFeatures(enabledFeatures: ExperimentalFeature[]) {
  addExperimentalFeatures(enabledFeatures)
  registerCleanupTask(resetExperimentalFeatures)
}
