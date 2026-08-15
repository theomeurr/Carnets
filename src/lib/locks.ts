import type { FolioState, Id, Lock, LockScope, Page } from '../types'

/** Le verrou posé exactement sur cette cible, s'il y en a un. */
export function lockOn(state: FolioState, scope: LockScope, id: Id): Lock | undefined {
  return state.locks.find((lock) => lock.scope === scope && lock.id === id)
}

/**
 * Le verrou qui protège une page : le sien, celui de sa section, ou celui de
 * son bloc-notes. L'imbrication étant interdite (voir `lockObstacle`), il ne
 * peut y en avoir qu'un — pas de cascade de mots de passe à saisir.
 */
export function lockOfPage(state: FolioState, page: Page): Lock | undefined {
  const own = lockOn(state, 'page', page.id)
  if (own) return own

  const section = lockOn(state, 'section', page.sectionId)
  if (section) return section

  const notebookId = state.sections.find((s) => s.id === page.sectionId)?.notebookId
  return notebookId ? lockOn(state, 'notebook', notebookId) : undefined
}

/**
 * Le verrou qui protégerait cette page si elle se trouvait dans `sectionId`.
 *
 * Sert à refuser un déplacement qui changerait de verrou : le contenu d'une
 * page protégée est chiffré avec la clé du verrou qui la couvre, et la faire
 * passer sous un autre la rendrait illisible pour toujours — ou déposerait en
 * clair, sous un verrou, une page qui ne l'est pas.
 *
 * Écrit en réutilisant `lockOfPage` plutôt qu'en répétant sa cascade : les
 * deux ne peuvent donc pas diverger.
 */
export function lockOfPageIn(state: FolioState, page: Page, sectionId: Id): Lock | undefined {
  return lockOfPage(state, { ...page, sectionId })
}

/** Toutes les pages qu'un verrou posé sur cette cible protégerait. */
export function pagesUnder(state: FolioState, scope: LockScope, id: Id): Page[] {
  if (scope === 'page') return state.pages.filter((page) => page.id === id)

  if (scope === 'section') return state.pages.filter((page) => page.sectionId === id)

  const sectionIds = new Set(
    state.sections.filter((s) => s.notebookId === id).map((section) => section.id),
  )
  return state.pages.filter((page) => sectionIds.has(page.sectionId))
}

/**
 * Ce qui empêche de poser un verrou ici, ou `null` si la voie est libre. On
 * refuse toute imbrication : un mot de passe par branche de l'arbre, jamais
 * deux à enchaîner pour atteindre une note.
 */
export function lockObstacle(state: FolioState, scope: LockScope, id: Id): string | null {
  if (lockOn(state, scope, id)) return 'Cet élément est déjà protégé.'

  // Un ancêtre déjà protégé ?
  if (scope === 'page') {
    const page = state.pages.find((p) => p.id === id)
    if (page && lockOfPage(state, page)) {
      return 'Cette page est déjà protégée par le verrou d’un parent.'
    }
  }
  if (scope === 'section') {
    const section = state.sections.find((s) => s.id === id)
    if (section && lockOn(state, 'notebook', section.notebookId)) {
      return 'Le bloc-notes qui contient cette section est déjà protégé.'
    }
  }

  // Un descendant déjà protégé ?
  const descendants = state.locks.filter((lock) => coveredBy(state, scope, id, lock))
  if (descendants.length > 0) {
    return scope === 'notebook'
      ? 'Une section ou une page de ce bloc-notes est déjà protégée. Retirez d’abord ce verrou.'
      : 'Une page de cette section est déjà protégée. Retirez d’abord ce verrou.'
  }

  return null
}

/** Vrai si `lock` porte sur quelque chose situé à l'intérieur de la cible. */
function coveredBy(state: FolioState, scope: LockScope, id: Id, lock: Lock): boolean {
  if (lock.scope === scope && lock.id === id) return false

  if (scope === 'notebook') {
    if (lock.scope === 'section') {
      return state.sections.some((s) => s.id === lock.id && s.notebookId === id)
    }
    if (lock.scope === 'page') {
      const page = state.pages.find((p) => p.id === lock.id)
      const section = page && state.sections.find((s) => s.id === page.sectionId)
      return section?.notebookId === id
    }
  }

  if (scope === 'section' && lock.scope === 'page') {
    return state.pages.some((p) => p.id === lock.id && p.sectionId === id)
  }

  return false
}

export function describeScope(scope: LockScope): string {
  if (scope === 'notebook') return 'le bloc-notes'
  if (scope === 'section') return 'la section'
  return 'la page'
}
