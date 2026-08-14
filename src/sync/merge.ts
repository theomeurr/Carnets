import { byOrder } from '../store/order'
import type { EntityKind, FolioState, Id, Lock, Notebook, Page, Section, Tombstone } from '../types'

/**
 * Ce qui circule entre un appareil et le serveur : les objets modifiés depuis
 * un instant donné, et les suppressions survenues depuis. C'est volontairement
 * la même forme dans les deux sens.
 */
export interface Changeset {
  notebooks: FolioState['notebooks']
  sections: FolioState['sections']
  pages: FolioState['pages']
  locks: FolioState['locks']
  tombstones: Tombstone[]
}

export const EMPTY_CHANGESET: Changeset = {
  notebooks: [],
  sections: [],
  pages: [],
  locks: [],
  tombstones: [],
}

export function isEmpty(changeset: Changeset): boolean {
  return (
    changeset.notebooks.length === 0 &&
    changeset.sections.length === 0 &&
    changeset.pages.length === 0 &&
    changeset.locks.length === 0 &&
    changeset.tombstones.length === 0
  )
}

/** Ce qui a changé localement depuis la dernière synchronisation réussie. */
export function localChanges(state: FolioState, since: number): Changeset {
  return {
    notebooks: state.notebooks.filter((n) => n.updatedAt > since),
    sections: state.sections.filter((s) => s.updatedAt > since),
    pages: state.pages.filter((p) => p.updatedAt > since),
    locks: state.locks.filter((l) => l.updatedAt > since),
    tombstones: state.tombstones.filter((t) => t.deletedAt > since),
  }
}

/**
 * Fusionne ce qui arrive du serveur dans l'état local.
 *
 * La règle est la même partout : **le plus récent gagne**, objet par objet.
 * Elle est modeste — deux appareils qui modifient la même page en même temps,
 * l'un des deux textes est perdu — mais elle est prévisible, et elle ne perd
 * jamais un objet *différent*. Une fusion caractère par caractère demanderait
 * un CRDT, qui est un autre projet.
 *
 * Une suppression l'emporte sur une modification de même date ou plus
 * ancienne : entre « j'ai jeté cette note » et « j'y ai touché avant », il
 * vaut mieux respecter la suppression, qui est un geste délibéré — et la note
 * reste récupérable côté serveur tant que la trace n'a pas expiré.
 */
export function merge(local: FolioState, incoming: Changeset): FolioState {
  const graves = tombstoneIndex(local, incoming)

  const merged = {
    ...local,
    notebooks: mergeCollection(local.notebooks, incoming.notebooks, 'notebook', graves),
    sections: mergeCollection(local.sections, incoming.sections, 'section', graves),
    pages: mergeCollection(local.pages, incoming.pages, 'page', graves),
    locks: mergeCollection(local.locks, incoming.locks, 'lock', graves),
    tombstones: mergeTombstones(local.tombstones, incoming.tombstones),
  }

  return merged
}

/** Toutes les suppressions connues, locales et distantes, indexées. */
function tombstoneIndex(local: FolioState, incoming: Changeset): Map<string, number> {
  const graves = new Map<string, number>()
  for (const t of [...local.tombstones, ...incoming.tombstones]) {
    const key = `${t.kind}:${t.id}`
    graves.set(key, Math.max(graves.get(key) ?? 0, t.deletedAt))
  }
  return graves
}

/**
 * Ce que cette fusion va retirer de l'état local, avec la date de la
 * suppression — de quoi alimenter la corbeille quand le geste vient d'un autre
 * appareil. Sans cela, une note supprimée sur le téléphone disparaîtrait du
 * PC sans y laisser de quoi la remettre.
 *
 * Fonction séparée plutôt que second retour de `merge` : celle-ci reste une
 * fusion, et la corbeille n'a pas à s'inviter dans sa signature.
 */
export interface Discarded {
  kind: EntityKind
  entity: Notebook | Section | Page | Lock
  deletedAt: number
}

export function discardedBy(local: FolioState, incoming: Changeset): Discarded[] {
  const graves = tombstoneIndex(local, incoming)
  const doomed: Discarded[] = []

  const sweep = (kind: EntityKind, entities: readonly { id: Id; updatedAt: number }[]) => {
    for (const entity of entities) {
      const deletedAt = graves.get(`${kind}:${entity.id}`)
      // Même règle qu'à la fusion, et c'est ce qui compte : la corbeille doit
      // recueillir exactement ce que `mergeCollection` va retirer.
      if (deletedAt !== undefined && deletedAt >= entity.updatedAt) {
        doomed.push({ kind, entity: entity as Discarded['entity'], deletedAt })
      }
    }
  }

  sweep('notebook', local.notebooks)
  sweep('section', local.sections)
  sweep('page', local.pages)
  sweep('lock', local.locks)
  return doomed
}

function mergeCollection<T extends { id: Id; updatedAt: number; createdAt: number; order?: number }>(
  local: T[],
  incoming: T[],
  kind: EntityKind,
  graves: Map<string, number>,
): T[] {
  const byId = new Map(local.map((entity) => [entity.id, entity]))
  let touched = false

  for (const candidate of incoming) {
    const existing = byId.get(candidate.id)
    if (!existing) {
      byId.set(candidate.id, candidate)
      touched = true
      continue
    }
    // Le plus récent l'emporte ; à égalité, on garde ce qu'on a déjà, pour
    // que la fusion soit stable si elle est rejouée.
    if (candidate.updatedAt > existing.updatedAt) {
      byId.set(candidate.id, candidate)
      touched = true
    }
  }

  // Ce qui a été supprimé après sa dernière modification s'en va.
  for (const [id, entity] of byId) {
    const deletedAt = graves.get(`${kind}:${id}`)
    if (deletedAt !== undefined && deletedAt >= entity.updatedAt) {
      byId.delete(id)
      touched = true
    }
  }

  if (!touched) return local

  /*
   * L'ordre d'affichage suit le rang de chaque entrée. Ce tri se faisait
   * auparavant sur la date de création : toute réorganisation manuelle était
   * donc défaite à la première synchronisation, y compris celle qu'on venait
   * de faire soi-même.
   */
  return [...byId.values()].sort(byOrder)
}

function mergeTombstones(local: Tombstone[], incoming: Tombstone[]): Tombstone[] {
  if (incoming.length === 0) return local
  const byKey = new Map(local.map((t) => [`${t.kind}:${t.id}`, t]))
  for (const candidate of incoming) {
    const key = `${candidate.kind}:${candidate.id}`
    const existing = byKey.get(key)
    if (!existing || candidate.deletedAt > existing.deletedAt) byKey.set(key, candidate)
  }
  return [...byKey.values()]
}
