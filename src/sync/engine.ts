import type { FolioState } from '../types'
import { isEmpty, localChanges, merge, type Changeset } from './merge'
import type { Remote } from './remote'

/**
 * Où en est cet appareil. **Deux repères, et non un seul** — c'est la
 * distinction qui fait fonctionner la synchronisation entre machines dont les
 * horloges ne sont pas d'accord :
 *
 *  * `pulled` est la date la plus récente **effectivement vue dans les données
 *    du serveur**. Elle n'est comparée qu'à d'autres dates venues du serveur,
 *    donc l'heure locale n'entre jamais dans l'équation.
 *
 *  * `pushed` est l'heure **locale** du dernier envoi. Elle n'est comparée
 *    qu'aux dates que cet appareil a lui-même écrites, sur la même horloge.
 *
 * Un seul repère mélangerait les deux : un PC en avance d'une minute sur un
 * téléphone placerait son curseur au-delà des dates écrites par le téléphone,
 * et ne redemanderait plus jamais ses notes. C'est exactement le défaut que
 * cette séparation corrige.
 */
export interface Cursors {
  pulled: number
  pushed: number
}

export const NEW_DEVICE: Cursors = { pulled: 0, pushed: 0 }

export interface SyncOutcome {
  /** L'état après fusion — identique à l'entrée si rien n'est arrivé. */
  state: FolioState
  cursors: Cursors
  /** Vrai si le serveur a apporté quelque chose. */
  received: boolean
  /** Vrai si l'on a envoyé quelque chose. */
  sent: boolean
}

/**
 * Marge de recouvrement sur l'envoi. Deux modifications faites dans la même
 * milliseconde que le dernier envoi passeraient sinon juste sous le seuil.
 * Elle ne s'applique qu'au repère local, où elle a un sens.
 */
export const PUSH_OVERLAP_MS = 2_000

/**
 * Un tour de synchronisation : on prend, puis on donne.
 *
 * **Tirer avant de pousser**, jamais l'inverse : si l'envoi échoue à
 * mi-chemin, on aura au moins intégré ce que les autres appareils avaient à
 * dire, et les repères ne bougeront pas — les modifications non envoyées
 * repartiront au tour suivant.
 */
export async function syncOnce(
  remote: Remote,
  state: FolioState,
  cursors: Cursors,
  now = Date.now(),
): Promise<SyncOutcome> {
  const incoming = await remote.pull(cursors.pulled)
  const received = !isEmpty(incoming)
  const merged = received ? merge(state, incoming) : state

  // Le nouveau repère de lecture vient des données elles-mêmes, jamais de
  // l'horloge locale.
  const pulled = Math.max(cursors.pulled, latestStamp(incoming))

  // Ce qu'on envoie est calculé **après** la fusion : inutile de renvoyer au
  // serveur ce qu'il vient de nous donner.
  const outgoing = localChanges(merged, Math.max(0, cursors.pushed - PUSH_OVERLAP_MS))
  const sent = !isEmpty(outgoing)
  if (sent) await remote.push(outgoing)

  return { state: merged, cursors: { pulled, pushed: now }, received, sent }
}

/**
 * Envoyer sans lire d'abord — la voie rapide, pour ce que l'on vient d'écrire
 * soi-même.
 *
 * `syncOnce` tire avant de pousser, ce qui coûte un aller-retour complet avant
 * que la moindre lettre ne parte. Cet ordre protège d'une chose précise : un
 * envoi qui échoue à mi-chemin sans qu'on ait intégré ce que les autres
 * disaient. Or les deux repères étant indépendants, pousser seul ne peut rien
 * corrompre : le repère de lecture ne bouge pas, et le tour suivant lira
 * normalement.
 *
 * On garde donc la lecture pour ce qui l'exige — la sonnette, le retour dans
 * l'onglet, la vérification périodique — et on s'en dispense quand il n'y a
 * qu'à transmettre sa propre frappe.
 */
export async function pushOnce(
  remote: Remote,
  state: FolioState,
  cursors: Cursors,
  now = Date.now(),
): Promise<SyncOutcome> {
  const outgoing = localChanges(state, Math.max(0, cursors.pushed - PUSH_OVERLAP_MS))
  const sent = !isEmpty(outgoing)
  if (!sent) return { state, cursors, received: false, sent: false }

  await remote.push(outgoing)
  return { state, cursors: { ...cursors, pushed: now }, received: false, sent: true }
}

/** La date la plus récente d'un lot reçu, ou 0 s'il est vide. */
function latestStamp(changes: Changeset): number {
  let latest = 0
  for (const entity of [
    ...changes.notebooks,
    ...changes.sections,
    ...changes.pages,
    ...changes.locks,
  ]) {
    if (entity.updatedAt > latest) latest = entity.updatedAt
  }
  for (const tombstone of changes.tombstones) {
    if (tombstone.deletedAt > latest) latest = tombstone.deletedAt
  }
  return latest
}

export type { Changeset }
