import {
  resetExperimentalFeatures,
  type ExperimentalFeatureType,
  addExperimentalFeatures,
} from '../../src/tools/experimentalFeatures'
import { registerCleanupTask } from '../registerCleanupTask'

export function mockExperimentalFeatures(enabledFeatures: ExperimentalFeatureType[]) {
  addExperimentalFeatures(enabledFeatures)
  registerCleanupTask(resetExperimentalFeatures)
}
