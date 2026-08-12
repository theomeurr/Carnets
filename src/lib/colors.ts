/**
 * La palette des bloc-notes. `id` est ce qui est stocké ; `hex` sert à peindre
 * l'onglet, le liseré de la colonne des pages et les accents de l'en-tête.
 */
export interface NotebookColor {
  id: string
  label: string
  hex: string
}

export const NOTEBOOK_COLORS: NotebookColor[] = [
  { id: 'indigo', label: 'Indigo', hex: '#6366f1' },
  { id: 'violet', label: 'Violet', hex: '#a855f7' },
  { id: 'rose', label: 'Rose', hex: '#ec4899' },
  { id: 'rouge', label: 'Rouge', hex: '#ef4444' },
  { id: 'ambre', label: 'Ambre', hex: '#f59e0b' },
  { id: 'emeraude', label: 'Émeraude', hex: '#10b981' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'ardoise', label: 'Ardoise', hex: '#64748b' },
]

const FALLBACK = NOTEBOOK_COLORS[0]

export function colorOf(id: string | undefined): NotebookColor {
  return NOTEBOOK_COLORS.find((c) => c.id === id) ?? FALLBACK
}

/** Couleur suivante non utilisée, pour que deux bloc-notes voisins se distinguent. */
export function nextColor(used: string[]): string {
  const free = NOTEBOOK_COLORS.find((c) => !used.includes(c.id))
  return (free ?? NOTEBOOK_COLORS[used.length % NOTEBOOK_COLORS.length]).id
}
