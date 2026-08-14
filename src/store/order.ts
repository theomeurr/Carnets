import type { Id } from '../types'

/**
 * L'ordre d'affichage, et comment le changer.
 *
 * **Un rang fractionnaire, pas un index.** Déplacer un élément ne réécrit que
 * lui : on lui donne un rang situé entre ses deux nouveaux voisins. Un index
 * entier obligerait à renuméroter toute la liste à chaque geste — donc à
 * renvoyer toutes ces lignes au serveur, et à provoquer des conflits entre
 * appareils là où il n'y a qu'un seul déplacement.
 *
 * **Le rang naît de la date de création.** Un élément sans rang vaut donc sa
 * date, ce qui reproduit exactement l'ordre d'avant : les notes déjà écrites
 * n'ont rien à migrer, et un appareil resté sur l'ancienne version continue
 * d'envoyer des lignes que celui-ci sait ranger.
 */

/** L'écart donné à un nouveau rang quand il n'y a pas de voisin pour l'encadrer. */
export const ORDER_STEP = 1024

/**
 * En deçà, l'espace entre deux voisins ne permet plus d'intercaler sans que
 * les décimales ne s'épuisent. On renumérote alors la fratrie.
 */
export const MIN_GAP = 1e-6

export interface Ranked {
  id: Id
  order?: number
  /** Optionnelle : `assemble` trie des entrées relues qui peuvent être abîmées. */
  createdAt?: number
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Le rang d'un élément, ou sa date de création s'il n'en a pas encore. Zéro
 * en dernier recours : une entrée abîmée se range au début plutôt que de
 * répandre des `NaN` dans le tri, qui rendrait l'ordre imprévisible.
 */
export function orderOf(entity: Ranked): number {
  if (finite(entity.order)) return entity.order
  return finite(entity.createdAt) ? entity.createdAt : 0
}

/** L'ordre d'affichage : par rang, l'identifiant tranchant les égalités. */
export function byOrder(a: Ranked, b: Ranked): number {
  return orderOf(a) - orderOf(b) || a.id.localeCompare(b.id)
}

/** Le rang d'un élément que l'on ajoute à la fin d'une liste. */
export function appendOrder(siblings: readonly Ranked[], now: number): number {
  if (siblings.length === 0) return now
  return Math.max(now, ...siblings.map(orderOf)) + ORDER_STEP
}

/**
 * Les rangs à réécrire pour que `id` occupe la place `to` parmi ses frères.
 *
 * Rend d'ordinaire une seule entrée — celle de l'élément déplacé. La fratrie
 * entière n'est renumérotée que lorsque l'espace entre deux voisins est
 * épuisé, ce qui demande une cinquantaine de dépôts successifs au même
 * endroit.
 *
 * Rend une liste vide si rien ne bouge : l'élément est déjà là où on le veut.
 */
export function moveWithin(
  siblings: readonly Ranked[],
  id: Id,
  to: number,
): { id: Id; order: number }[] {
  const sorted = [...siblings].sort(byOrder)
  const from = sorted.findIndex((entity) => entity.id === id)
  if (from === -1) return []

  const rest = sorted.filter((entity) => entity.id !== id)
  const target = Math.max(0, Math.min(to, rest.length))
  /*
   * `to` se compte dans la liste privée de l'élément. Y insérer à sa propre
   * position `from` le remet exactement là où il était : c'est le seul cas où
   * rien ne bouge. Insérer en `from + 1` le fait bien descendre d'un cran —
   * le compter comme immobile empêchait tout déplacement vers le bas.
   */
  if (target === from) return []

  const before = rest[target - 1]
  const after = rest[target]

  if (!before && !after) return [{ id, order: 0 }]
  if (!before) return [{ id, order: orderOf(after) - ORDER_STEP }]
  if (!after) return [{ id, order: orderOf(before) + ORDER_STEP }]

  const gap = orderOf(after) - orderOf(before)
  if (gap > MIN_GAP) return [{ id, order: orderOf(before) + gap / 2 }]

  // Plus de place : on réétale toute la fratrie, l'élément à sa nouvelle place.
  const placed = [...rest.slice(0, target), sorted[from], ...rest.slice(target)]
  const base = Math.floor(orderOf(placed[0]))
  return placed.map((entity, index) => ({ id: entity.id, order: base + index * ORDER_STEP }))
}
