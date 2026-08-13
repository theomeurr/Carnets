import { describe, expect, it } from 'vitest'
import { lockObstacle, lockOfPage, lockOn, pagesUnder } from './locks'
import type { CarnetsState, Lock, LockScope } from '../types'

const lock = (scope: LockScope, id: string): Lock => ({
  id,
  scope,
  salt: 'sel',
  iterations: 1,
  verifier: 'témoin',
  createdAt: 0,
})

/** n1 { s1 [p1, p2], s2 [p3] }, n2 { s3 [p4] } */
function classeur(locks: Lock[] = []): CarnetsState {
  const page = (id: string, sectionId: string) => ({
    id,
    sectionId,
    title: id,
    html: '',
    text: '',
    cipher: null,
    createdAt: 0,
    updatedAt: 0,
  })
  return {
    version: 1,
    notebooks: [
      { id: 'n1', name: 'n1', color: 'indigo', createdAt: 0 },
      { id: 'n2', name: 'n2', color: 'rose', createdAt: 0 },
    ],
    sections: [
      { id: 's1', notebookId: 'n1', name: 's1', createdAt: 0 },
      { id: 's2', notebookId: 'n1', name: 's2', createdAt: 0 },
      { id: 's3', notebookId: 'n2', name: 's3', createdAt: 0 },
    ],
    pages: [page('p1', 's1'), page('p2', 's1'), page('p3', 's2'), page('p4', 's3')],
    locks,
    selection: { notebookId: 'n1', sectionId: 's1', pageId: 'p1' },
  }
}

const pageOf = (state: CarnetsState, id: string) => state.pages.find((p) => p.id === id)!

describe('portée d’un verrou', () => {
  it('couvre la page visée', () => {
    expect(pagesUnder(classeur(), 'page', 'p1').map((p) => p.id)).toEqual(['p1'])
  })

  it('couvre toutes les pages de la section', () => {
    expect(pagesUnder(classeur(), 'section', 's1').map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('couvre toutes les pages du bloc-notes, sections comprises', () => {
    expect(pagesUnder(classeur(), 'notebook', 'n1').map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('verrou effectif d’une page', () => {
  it('n’en trouve aucun sur un classeur ouvert', () => {
    const state = classeur()
    expect(lockOfPage(state, pageOf(state, 'p1'))).toBeUndefined()
  })

  it('trouve le verrou posé sur la page elle-même', () => {
    const state = classeur([lock('page', 'p1')])
    expect(lockOfPage(state, pageOf(state, 'p1'))?.scope).toBe('page')
    expect(lockOfPage(state, pageOf(state, 'p2'))).toBeUndefined()
  })

  it('remonte à la section', () => {
    const state = classeur([lock('section', 's1')])
    expect(lockOfPage(state, pageOf(state, 'p2'))?.id).toBe('s1')
    expect(lockOfPage(state, pageOf(state, 'p3'))).toBeUndefined()
  })

  it('remonte jusqu’au bloc-notes', () => {
    const state = classeur([lock('notebook', 'n1')])
    expect(lockOfPage(state, pageOf(state, 'p3'))?.id).toBe('n1')
    expect(lockOfPage(state, pageOf(state, 'p4'))).toBeUndefined()
  })
})

describe('interdiction de l’imbrication', () => {
  it('laisse poser un verrou sur un classeur ouvert', () => {
    expect(lockObstacle(classeur(), 'section', 's1')).toBeNull()
  })

  it('refuse un deuxième verrou au même endroit', () => {
    expect(lockObstacle(classeur([lock('section', 's1')]), 'section', 's1')).toMatch(/déjà protégé/)
  })

  it('refuse un verrou sous un ancêtre protégé', () => {
    const state = classeur([lock('notebook', 'n1')])
    expect(lockObstacle(state, 'section', 's1')).toMatch(/bloc-notes/)
    expect(lockObstacle(state, 'page', 'p1')).toMatch(/parent/)
  })

  it('refuse un verrou au-dessus d’un descendant protégé', () => {
    expect(lockObstacle(classeur([lock('page', 'p1')]), 'section', 's1')).toMatch(/page/)
    expect(lockObstacle(classeur([lock('section', 's1')]), 'notebook', 'n1')).toMatch(/section/)
    expect(lockObstacle(classeur([lock('page', 'p1')]), 'notebook', 'n1')).toMatch(/section|page/)
  })

  it('laisse protéger une branche voisine', () => {
    const state = classeur([lock('section', 's1')])
    expect(lockObstacle(state, 'section', 's2')).toBeNull()
    expect(lockObstacle(state, 'notebook', 'n2')).toBeNull()
  })

  it('laisse protéger deux pages d’une même section, chacune de son côté', () => {
    // Les verrous frères sont indépendants : deux pages voisines peuvent avoir
    // deux mots de passe différents. Seule la superposition est interdite.
    const state = classeur([lock('page', 'p1')])
    expect(lockObstacle(state, 'page', 'p2')).toBeNull()
    expect(lockObstacle(state, 'page', 'p3')).toBeNull()
  })
})

describe('recherche d’un verrou précis', () => {
  it('distingue la portée', () => {
    const state = classeur([lock('section', 'x'), lock('page', 'x')])
    expect(lockOn(state, 'page', 'x')?.scope).toBe('page')
    expect(lockOn(state, 'notebook', 'x')).toBeUndefined()
  })
})
