import type { CarnetsState } from '../../types'

export interface Change<T> {
  /** Entrées à (ré)écrire : ajoutées ou modifiées. */
  puts: T[]
  /** Identifiants disparus de la collection. */
  deletes: string[]
}

/**
 * Compare deux versions d'une collection **par identité d'objet**. Le reducer
 * ne recrée que les entrées qu'il modifie : une page dont l'objet est resté le
 * même n'a pas bougé, sans qu'il soit besoin de comparer champ par champ.
 *
 * C'est ce qui rend l'enregistrement proportionnel à la frappe et non à la
 * taille du classeur — écrire un caractère touche une page, pas tout.
 */
export function changes<T extends { id: string }>(
  previous: readonly T[] | undefined,
  next: readonly T[],
): Change<T> {
  const before = new Map((previous ?? []).map((entity) => [entity.id, entity]))
  const puts: T[] = []

  for (const entity of next) {
    if (before.get(entity.id) !== entity) puts.push(entity)
    before.delete(entity.id)
  }

  // Ce qui reste dans `before` n'existe plus dans `next`.
  return { puts, deletes: [...before.keys()] }
}

/** Vrai quand rien n'a bougé : évite d'ouvrir une transaction pour rien. */
export function unchanged(previous: CarnetsState | null, next: CarnetsState): boolean {
  return (
    previous !== null &&
    previous.notebooks === next.notebooks &&
    previous.sections === next.sections &&
    previous.pages === next.pages &&
    previous.locks === next.locks &&
    previous.selection === next.selection
  )
}
