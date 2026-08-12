import { htmlToText } from '../lib/text'
import type { CarnetsState, Notebook, Page, Section } from '../types'

const KEY = 'carnets:state'
export const STATE_VERSION = 1

/**
 * Relit l'état du navigateur. Tout ce qui n'a pas la forme attendue est écarté
 * plutôt que de faire planter le démarrage : une entrée abîmée coûte une note,
 * pas l'application entière.
 */
export function load(): CarnetsState | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null // navigation privée, stockage refusé : on tourne en mémoire.
  }
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as unknown
    return validate(parsed)
  } catch {
    return null
  }
}

export function save(state: CarnetsState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Quota plein ou stockage indisponible : la session reste utilisable.
  }
}

function validate(input: unknown): CarnetsState | null {
  if (typeof input !== 'object' || input === null) return null
  const candidate = input as Partial<CarnetsState>
  if (candidate.version !== STATE_VERSION) return null
  if (
    !Array.isArray(candidate.notebooks) ||
    !Array.isArray(candidate.sections) ||
    !Array.isArray(candidate.pages)
  ) {
    return null
  }

  const notebooks = candidate.notebooks.filter(isNotebook)
  const notebookIds = new Set(notebooks.map((n) => n.id))
  const sections = candidate.sections
    .filter(isSection)
    .filter((s) => notebookIds.has(s.notebookId))
  const sectionIds = new Set(sections.map((s) => s.id))
  const pages = candidate.pages
    .filter(isPage)
    .filter((p) => sectionIds.has(p.sectionId))
    // `text` et les dates sont reconstruits au besoin : une page écrite par une
    // version antérieure reste lisible et cherchable.
    .map((p) => ({
      ...p,
      text: typeof p.text === 'string' ? p.text : htmlToText(p.html),
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
    }))

  if (notebooks.length === 0) return null

  const selection = candidate.selection ?? { notebookId: null, sectionId: null, pageId: null }
  return {
    version: STATE_VERSION,
    notebooks,
    sections,
    pages,
    // Une sélection incohérente est rattrapée au premier passage du reducer.
    selection: {
      notebookId: typeof selection.notebookId === 'string' ? selection.notebookId : null,
      sectionId: typeof selection.sectionId === 'string' ? selection.sectionId : null,
      pageId: typeof selection.pageId === 'string' ? selection.pageId : null,
    },
  }
}

function isNotebook(value: unknown): value is Notebook {
  const n = value as Partial<Notebook>
  return typeof n?.id === 'string' && typeof n.name === 'string' && typeof n.color === 'string'
}

function isSection(value: unknown): value is Section {
  const s = value as Partial<Section>
  return typeof s?.id === 'string' && typeof s.name === 'string' && typeof s.notebookId === 'string'
}

function isPage(value: unknown): value is Page {
  const p = value as Partial<Page>
  return (
    typeof p?.id === 'string' &&
    typeof p.sectionId === 'string' &&
    typeof p.title === 'string' &&
    typeof p.html === 'string'
  )
}
