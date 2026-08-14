import type { FolioState } from '../types'
import { isEmpty, localChanges, merge, type Changeset } from './merge'
import type { Remote } from './remote'

export interface SyncOutcome {
  /** L'état après fusion — identique à l'entrée si rien n'est arrivé. */
  state: FolioState
  /** Nouveau curseur, à passer au tour suivant. */
  cursor: number
  /** Vrai si le serveur a apporté quelque chose. */
  received: boolean
  /** Vrai si l'on a envoyé quelque chose. */
  sent: boolean
}

/**
 * Un tour de synchronisation : on prend, puis on donne.
 *
 * **Tirer avant de pousser**, jamais l'inverse : si l'envoi échoue à
 * mi-chemin, on aura au moins intégré ce que les autres appareils avaient à
 * dire, et le curseur ne bougera pas — les modifications non envoyées
 * repartiront au tour suivant.
 *
 * Le curseur est reculé de quelques secondes à chaque tour. Les horloges du
 * serveur et des appareils ne sont pas parfaitement d'accord ; sans cette
 * marge, une modification écrite pendant le tour précédent pourrait passer
 * juste sous le seuil et n'être jamais relue.
 */
export const CURSOR_OVERLAP_MS = 5_000

export async function syncOnce(
  remote: Remote,
  state: FolioState,
  cursor: number,
  now = Date.now(),
): Promise<SyncOutcome> {
  const incoming = await remote.pull(Math.max(0, cursor - CURSOR_OVERLAP_MS))
  const received = !isEmpty(incoming)
  const merged = received ? merge(state, incoming) : state

  // Ce qu'on envoie est calculé **après** la fusion : inutile de renvoyer au
  // serveur ce qu'il vient de nous donner.
  const outgoing = localChanges(merged, Math.max(0, cursor - CURSOR_OVERLAP_MS))
  const sent = !isEmpty(outgoing)
  if (sent) await remote.push(outgoing)

  return { state: merged, cursor: now, received, sent }
}

/** Le tout premier tour : on prend tout, et on envoie tout. */
export function firstSync(
  remote: Remote,
  state: FolioState,
  now = Date.now(),
): Promise<SyncOutcome> {
  return syncOnce(remote, state, 0, now)
}

export type { Changeset }
