import { htmlToText } from '../../lib/text'
import type { FolioState, Lock, Notebook, Page, Section, Selection, Tombstone } from '../../types'
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
  rawLocks: unknown[],
  rawTombstones: unknown[],
  rawSelection: unknown,
  now = Date.now(),
): FolioState | null {
  const notebooks = rawNotebooks.filter(isNotebook).sort(byCreation).map(dated)
  if (notebooks.length === 0) return null

  const notebookIds = new Set(notebooks.map((n) => n.id))
  const sections = rawSections
    .filter(isSection)
    .filter((s) => notebookIds.has(s.notebookId))
    .sort(byCreation)
    .map(dated)

  const sectionIds = new Set(sections.map((s) => s.id))
  const pages = rawPages
    .filter(isPage)
    .filter((p) => sectionIds.has(p.sectionId))
    .sort(byCreation)
    // `text` et les dates sont reconstruits au besoin : une page écrite par une
    // version antérieure reste lisible et cherchable.
    .map((p) => ({
      ...p,
      // Une page chiffrée n'a pas de texte à réparer : son contenu est dans
      // `cipher`, et le reste doit rester vide.
      text: typeof p.text === 'string' ? p.text : p.cipher ? '' : htmlToText(p.html),
      cipher: typeof p.cipher === 'string' ? p.cipher : null,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    }))

  // Un verrou qui ne désigne plus rien est écarté : il bloquerait un élément
  // inexistant, et `settle` le retirerait de toute façon au premier passage.
  const pageIds = new Set(pages.map((p) => p.id))
  const locks = rawLocks.filter(isLock).map(dated).filter((lock) => {
    if (lock.scope === 'notebook') return notebookIds.has(lock.id)
    if (lock.scope === 'section') return sectionIds.has(lock.id)
    return pageIds.has(lock.id)
  })

  // Une trace de suppression finit par ne plus servir : tous les appareils
  // l'ont vue depuis longtemps. On les oublie au bout de trois mois pour que
  // la liste ne grossisse pas indéfiniment.
  const tombstones = rawTombstones
    .filter(isTombstone)
    .filter((t) => now - t.deletedAt < TOMBSTONE_TTL_MS)

  return {
    version: STATE_VERSION,
    notebooks,
    sections,
    pages,
    locks,
    tombstones,
    // Une sélection incohérente est rattrapée au premier passage du reducer.
    selection: readSelection(rawSelection),
  }
}

/**
 * `updatedAt` n'existait pas avant la synchronisation : on le fait naître de
 * `createdAt` pour les données déjà écrites, plutôt que de les traiter comme
 * infiniment anciennes.
 */
function dated<T extends { createdAt?: number; updatedAt?: number }>(entity: T): T {
  return typeof entity.updatedAt === 'number'
    ? entity
    : { ...entity, updatedAt: entity.createdAt ?? 0 }
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

/** Durée de conservation des traces de suppression. */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000

export function isTombstone(value: unknown): value is Tombstone {
  const t = value as Partial<Tombstone>
  return (
    typeof t?.id === 'string' &&
    typeof t.deletedAt === 'number' &&
    (t.kind === 'notebook' || t.kind === 'section' || t.kind === 'page' || t.kind === 'lock')
  )
}

export function isLock(value: unknown): value is Lock {
  const l = value as Partial<Lock>
  return (
    typeof l?.id === 'string' &&
    (l.scope === 'notebook' || l.scope === 'section' || l.scope === 'page') &&
    typeof l.salt === 'string' &&
    typeof l.iterations === 'number' &&
    typeof l.verifier === 'string'
  )
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
