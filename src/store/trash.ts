import type {
  EntityKind,
  FolioState,
  Id,
  Lock,
  Notebook,
  Page,
  Section,
  TrashedItem,
} from '../types'

/**
 * La corbeille.
 *
 * Supprimer laisse une pierre tombale, qui dit qu'une chose a disparu mais pas
 * ce qu'elle contenait. On garde donc l'objet lui-même de côté, sur l'appareil,
 * pour pouvoir le remettre.
 *
 * Restaurer ne demande aucun traitement particulier au moteur de
 * synchronisation : celui-ci n'efface un objet que si la suppression est *plus
 * récente* que lui (`merge.ts`). Il suffit donc de le remettre avec une date
 * de modification postérieure à sa suppression, et il ressuscite partout.
 */

export const KEEP_MS = 30 * 24 * 60 * 60 * 1000

export const keyOf = (kind: EntityKind, id: Id): string => `${kind}:${id}`

/**
 * Tout ce qu'une suppression va emporter — l'objet visé, sa descendance, et
 * les verrous qui les protégeaient.
 *
 * Cette cascade répète celle du reducer, et c'est délibéré : le reducer
 * calcule ce qu'il retire de l'état, celui-ci calcule ce qu'il faut garder.
 * Les deux sont vérifiés par le même test, qui compare l'état d'après à ce que
 * la corbeille a recueilli — si l'un des deux dérivait, le test le dirait.
 */
export function doomedBy(state: FolioState, kind: EntityKind, id: Id): TrashedItem[] {
  const notebooks: Notebook[] = []
  const sections: Section[] = []
  const pages: Page[] = []

  if (kind === 'notebook') {
    const notebook = state.notebooks.find((n) => n.id === id)
    if (!notebook) return []
    notebooks.push(notebook)
    sections.push(...state.sections.filter((s) => s.notebookId === id))
    const ids = new Set(sections.map((s) => s.id))
    pages.push(...state.pages.filter((p) => ids.has(p.sectionId)))
  } else if (kind === 'section') {
    const section = state.sections.find((s) => s.id === id)
    if (!section) return []
    sections.push(section)
    pages.push(...state.pages.filter((p) => p.sectionId === id))
  } else if (kind === 'page') {
    const page = state.pages.find((p) => p.id === id)
    if (!page) return []
    pages.push(page)
  } else {
    return []
  }

  // Un verrou dont la cible s'en va n'a plus rien à protéger : le reducer le
  // retire sans bruit. Sans lui, une page protégée reviendrait illisible —
  // son contenu reste chiffré, et la clé se dérive du verrou.
  const targets = new Set([
    ...notebooks.map((n) => keyOf('notebook', n.id)),
    ...sections.map((s) => keyOf('section', s.id)),
    ...pages.map((p) => keyOf('page', p.id)),
  ])
  const locks = state.locks.filter((lock) => targets.has(keyOf(lock.scope, lock.id)))

  return [
    ...notebooks.map((entity) => item('notebook', entity)),
    ...sections.map((entity) => item('section', entity)),
    ...pages.map((entity) => item('page', entity)),
    ...locks.map((entity) => item('lock', entity)),
  ]
}

function item(kind: EntityKind, entity: Notebook | Section | Page | Lock): TrashedItem {
  return { key: keyOf(kind, entity.id), kind, id: entity.id, deletedAt: 0, entity }
}

/** Date la récolte. `deletedAt` doit être celle de la suppression elle-même. */
export function stamp(items: TrashedItem[], deletedAt: number): TrashedItem[] {
  return items.map((entry) => ({ ...entry, deletedAt }))
}

/**
 * Ce que la corbeille montre : un geste, une ligne.
 *
 * Supprimer un bloc-notes emporte ses sections et toutes leurs pages. Les
 * lister une à une donnerait dix entrées pour un seul geste, et noierait les
 * suppressions que l'on cherche vraiment. On ne montre donc que le sommet :
 * ce qui a été emporté *en même temps* que son parent reste caché, et revient
 * avec lui.
 *
 * « En même temps » se lit sur la date : le reducer donne le même instant à
 * toute la cascade. Une page supprimée seule, puis son bloc-notes une heure
 * plus tard, garde donc bien ses deux lignes.
 */
export function visible(trash: TrashedItem[]): TrashedItem[] {
  const byKey = new Map(trash.map((entry) => [entry.key, entry]))

  const swallowed = (entry: TrashedItem): boolean => {
    const parentKey =
      entry.kind === 'page'
        ? keyOf('section', (entry.entity as Page).sectionId)
        : entry.kind === 'section'
          ? keyOf('notebook', (entry.entity as Section).notebookId)
          : null
    if (!parentKey) return false
    const parent = byKey.get(parentKey)
    return parent !== undefined && parent.deletedAt === entry.deletedAt
  }

  return trash
    .filter((entry) => entry.kind !== 'lock' && !swallowed(entry))
    .sort((a, b) => b.deletedAt - a.deletedAt || a.key.localeCompare(b.key))
}

/** Ce qui a dépassé la durée de garde et peut partir pour de bon. */
export function expired(trash: TrashedItem[], now: number): TrashedItem[] {
  return trash.filter((entry) => now - entry.deletedAt >= KEEP_MS)
}

/**
 * Ce qu'il faut remettre pour que `entry` retrouve sa place : lui-même, ses
 * ancêtres disparus s'ils sont encore en corbeille, et les verrous qui les
 * protégeaient. Rend `null` quand un ancêtre manque partout — la page existe
 * encore, mais plus rien ne peut l'accueillir.
 */
export function restoration(
  state: FolioState,
  trash: TrashedItem[],
  entry: TrashedItem,
): TrashedItem[] | null {
  const byKey = new Map(trash.map((candidate) => [candidate.key, candidate]))
  const needed = new Map<string, TrashedItem>()

  const claim = (kind: EntityKind, id: Id): boolean => {
    const key = keyOf(kind, id)
    if (needed.has(key)) return true
    const found = byKey.get(key)
    if (!found) return false
    needed.set(key, found)
    return true
  }

  const haveNotebook = (id: Id) => state.notebooks.some((n) => n.id === id)
  const haveSection = (id: Id) => state.sections.some((s) => s.id === id)

  if (entry.kind === 'page') {
    const page = entry.entity as Page
    if (!haveSection(page.sectionId)) {
      if (!claim('section', page.sectionId)) return null
      const section = needed.get(keyOf('section', page.sectionId))!.entity as Section
      if (!haveNotebook(section.notebookId) && !claim('notebook', section.notebookId)) return null
    }
  } else if (entry.kind === 'section') {
    const section = entry.entity as Section
    if (!haveNotebook(section.notebookId) && !claim('notebook', section.notebookId)) return null
  }

  needed.set(entry.key, entry)

  // Remettre un bloc-notes ou une section remet ce qu'ils contenaient : sinon
  // l'on récupérerait un classeur vide, ce que personne n'a demandé.
  if (entry.kind === 'notebook') {
    for (const candidate of trash) {
      if (candidate.kind === 'section' && (candidate.entity as Section).notebookId === entry.id) {
        needed.set(candidate.key, candidate)
      }
    }
  }
  for (const candidate of trash) {
    if (candidate.kind !== 'page') continue
    const parent = keyOf('section', (candidate.entity as Page).sectionId)
    if (needed.has(parent)) needed.set(candidate.key, candidate)
  }

  // Les verrous suivent leurs cibles, pour qu'une note protégée revienne
  // protégée — et donc lisible.
  for (const candidate of trash) {
    if (candidate.kind !== 'lock') continue
    const lock = candidate.entity as Lock
    if (needed.has(keyOf(lock.scope, lock.id))) needed.set(candidate.key, candidate)
  }

  return [...needed.values()]
}

/**
 * Ce qu'une suppression définitive emporte : l'entrée, ce qu'elle contenait, et
 * leurs verrous. Pas ses ancêtres — jeter une page ne doit pas jeter la section
 * qui l'attend encore en corbeille.
 */
export function subtree(trash: TrashedItem[], entry: TrashedItem): TrashedItem[] {
  const taken = new Map<string, TrashedItem>([[entry.key, entry]])

  if (entry.kind === 'notebook') {
    for (const candidate of trash) {
      if (candidate.kind === 'section' && (candidate.entity as Section).notebookId === entry.id) {
        taken.set(candidate.key, candidate)
      }
    }
  }
  for (const candidate of trash) {
    if (candidate.kind !== 'page') continue
    if (taken.has(keyOf('section', (candidate.entity as Page).sectionId))) {
      taken.set(candidate.key, candidate)
    }
  }
  for (const candidate of trash) {
    if (candidate.kind !== 'lock') continue
    const lock = candidate.entity as Lock
    if (taken.has(keyOf(lock.scope, lock.id))) taken.set(candidate.key, candidate)
  }

  return [...taken.values()]
}

/**
 * La date à donner aux objets remis. Elle doit dépasser celle de leur
 * suppression, faute de quoi la fusion les effacerait à nouveau — y compris
 * quand l'horloge de l'appareil qui a supprimé avançait sur la nôtre.
 */
export function revivalStamp(items: TrashedItem[], now: number): number {
  return Math.max(now, ...items.map((entry) => entry.deletedAt + 1))
}
