// Canonical gitmoji prefix convention. Must stay in sync with docs/DEVELOPMENT.md.
// The order within each category is the priority used by the changelog generator.

export type GitmojiCategory = 'public' | 'internal'

export interface Gitmoji {
  emoji: string
  label: string
  category: GitmojiCategory
}

export const GITMOJI: readonly Gitmoji[] = [
  // User-facing changes
  { emoji: '💥', label: 'Breaking change', category: 'public' },
  { emoji: '✨', label: 'New feature', category: 'public' },
  { emoji: '🐛', label: 'Bug fix', category: 'public' },
  { emoji: '⚡️', label: 'Performance', category: 'public' },
  { emoji: '📝', label: 'Documentation', category: 'public' },
  { emoji: '⚗️', label: 'Experimental', category: 'public' },

  // Internal changes
  { emoji: '👷', label: 'Build/CI', category: 'internal' },
  { emoji: '♻️', label: 'Refactor', category: 'internal' },
  { emoji: '🎨', label: 'Code structure', category: 'internal' },
  { emoji: '✅', label: 'Tests', category: 'internal' },
  { emoji: '🔧', label: 'Configuration', category: 'internal' },
  { emoji: '🔥', label: 'Removal', category: 'internal' },
  { emoji: '👌', label: 'Code review', category: 'internal' },
  { emoji: '🚨', label: 'Linting', category: 'internal' },
  { emoji: '🧹', label: 'Cleanup', category: 'internal' },
  { emoji: '🔊', label: 'Logging', category: 'internal' },
  { emoji: '🔇', label: 'Remove logs', category: 'internal' },
]

// Strip the Unicode variation selector (U+FE0F) so '⚡' and '⚡️' compare equal.
const VARIATION_SELECTOR = /\uFE0F/g
export const normalizeGitmoji = (value: string): string => value.replace(VARIATION_SELECTOR, '')

// Exported priorities are normalized so they match the output of `\p{Extended_Pictographic}`,
// which strips the U+FE0F variation selector.
export const PUBLIC_EMOJI_PRIORITY: readonly string[] = GITMOJI.filter((g) => g.category === 'public').map((g) =>
  normalizeGitmoji(g.emoji)
)
export const INTERNAL_EMOJI_PRIORITY: readonly string[] = GITMOJI.filter((g) => g.category === 'internal').map((g) =>
  normalizeGitmoji(g.emoji)
)
