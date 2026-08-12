import { htmlToText } from '../../lib/text'
import type { CarnetsState, Notebook, Page, Section, Selection } from '../../types'
import { STATE_VERSION } from './types'

/**
 * Reconstruit un état cohérent à partir de données brutes relues d'un support.
 * Tout ce qui n'a pas la forme attendue est écarté plutôt que de faire planter
 * le démarrage, et les enfants orphelins sont élagués : une entrée abîmée coûte
 * une note, pas le classeur entier.
 *
 * L'ordre d'affichage est celui de la création. Les supports clé-valeur
 * rendent les entrées triées par identifiant, on rétablit donc l'ordre ici.
 * (Le jour où le glisser-déposer arrivera, il faudra un champ d'ordre explicite.)
 */
export function assemble(
  rawNotebooks: unknown[],
  rawSections: unknown[],
  rawPages: unknown[],
  rawSelection: unknown,
): CarnetsState | null {
  const notebooks = rawNotebooks.filter(isNotebook).sort(byCreation)
  if (notebooks.length === 0) return null

  const notebookIds = new Set(notebooks.map((n) => n.id))
  const sections = rawSections
    .filter(isSection)
    .filter((s) => notebookIds.has(s.notebookId))
    .sort(byCreation)

  const sectionIds = new Set(sections.map((s) => s.id))
  const pages = rawPages
    .filter(isPage)
    .filter((p) => sectionIds.has(p.sectionId))
    .sort(byCreation)
    // `text` et les dates sont reconstruits au besoin : une page écrite par une
    // version antérieure reste lisible et cherchable.
    .map((p) => ({
      ...p,
      text: typeof p.text === 'string' ? p.text : htmlToText(p.html),
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    }))

  return {
    version: STATE_VERSION,
    notebooks,
    sections,
    pages,
    // Une sélection incohérente est rattrapée au premier passage du reducer.
    selection: readSelection(rawSelection),
  }
}

/** À date de création égale, l'identifiant tranche : l'ordre reste stable. */
function byCreation(a: { createdAt?: number; id: string }, b: { createdAt?: number; id: string }) {
  return (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id)
}

function readSelection(raw: unknown): Selection {
  const value = (raw ?? {}) as Partial<Selection>
  const id = (candidate: unknown) => (typeof candidate === 'string' ? candidate : null)
  return {
    notebookId: id(value.notebookId),
    sectionId: id(value.sectionId),
    pageId: id(value.pageId),
  }
}

export function isNotebook(value: unknown): value is Notebook {
  const n = value as Partial<Notebook>
  return typeof n?.id === 'string' && typeof n.name === 'string' && typeof n.color === 'string'
}

export function isSection(value: unknown): value is Section {
  const s = value as Partial<Section>
  return typeof s?.id === 'string' && typeof s.name === 'string' && typeof s.notebookId === 'string'
}

export function isPage(value: unknown): value is Page {
  const p = value as Partial<Page>
  return (
    typeof p?.id === 'string' &&
    typeof p.sectionId === 'string' &&
    typeof p.title === 'string' &&
    typeof p.html === 'string'
  )
}
