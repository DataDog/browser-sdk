interface VocConfigBase {
  name: string
  description: string
  type: 'free-text' | 'scale'
  triggerActionName: string
  trackedUserEmails: Set<string>
  excludedUserEmails?: Set<string>
  sampleRate?: number
}

interface VocConfigFreeText extends VocConfigBase {
  type: 'free-text'
  question: string
}

interface VocConfigScale extends VocConfigBase {
  type: 'scale'
  question: string
  range: { min: { label: string; value: number }; max: { label: string; value: number } }
}

export type VocConfig = VocConfigFreeText | VocConfigScale

const mockVocConfigFreeText: VocConfigFreeText = {
  name: 'User Feedback Survey',
  description: 'Collect free-text feedback from users about their experience.',
  type: 'free-text',
  triggerActionName: 'Sankey diagram header',
  trackedUserEmails: new Set([
    'user1@example.com',
    'user2@example.com',
    'user3@example.com',
    'hamza.kadiri@datadoghq.com',
  ]),
  excludedUserEmails: new Set(['excluded_user@example.com']),
  sampleRate: 0.5,
  question: 'What do you think about our product?',
}

const mockVocConfigScale: VocConfigScale = {
  name: 'Customer Satisfaction Scale',
  description: 'Measure customer satisfaction on a scale from 1 to 10.',
  type: 'scale',
  triggerActionName: 'View Name',
  trackedUserEmails: new Set(['customer1@example.com', 'customer2@example.com', 'hamza.kadiri@datadoghq.com']),
  excludedUserEmails: new Set(['internal_user@example.com']),
  sampleRate: 0.8,
  question: 'How satisfied are you with our service?',
  range: {
    min: { label: 'Very Unsatisfied', value: 1 },
    max: { label: 'Very Satisfied', value: 10 },
  },
}

const generateVocConfigMap = (config: VocConfig[]): Map<string, VocConfig> =>
  new Map(config.map((c) => [c.triggerActionName, c]))

export const getVocConfig = () => generateVocConfigMap([mockVocConfigFreeText, mockVocConfigScale])
