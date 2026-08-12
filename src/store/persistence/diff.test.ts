import { describe, expect, it } from 'vitest'
import type { CarnetsState } from '../../types'
import { changes, unchanged } from './diff'

const entity = (id: string, name = id) => ({ id, name })

describe('diff des collections', () => {
  it('n’écrit rien quand les objets sont restés les mêmes', () => {
    const a = entity('1')
    const b = entity('2')
    expect(changes([a, b], [a, b])).toEqual({ puts: [], deletes: [] })
  })

  it('écrit uniquement l’entrée remplacée', () => {
    const a = entity('1')
    const b = entity('2')
    const modifié = { ...b, name: 'nouveau' }
    expect(changes([a, b], [a, modifié])).toEqual({ puts: [modifié], deletes: [] })
  })

  it('écrit les entrées ajoutées', () => {
    const a = entity('1')
    const c = entity('3')
    expect(changes([a], [a, c])).toEqual({ puts: [c], deletes: [] })
  })

  it('signale les entrées disparues', () => {
    const a = entity('1')
    const b = entity('2')
    expect(changes([a, b], [a])).toEqual({ puts: [], deletes: ['2'] })
  })

  it('traite une collection encore jamais écrite comme entièrement nouvelle', () => {
    const a = entity('1')
    expect(changes(undefined, [a])).toEqual({ puts: [a], deletes: [] })
  })

  it('ne réécrit pas une entrée simplement déplacée dans le tableau', () => {
    const a = entity('1')
    const b = entity('2')
    expect(changes([a, b], [b, a])).toEqual({ puts: [], deletes: [] })
  })

  it('combine ajout, modification et suppression', () => {
    const a = entity('1')
    const b = entity('2')
    const c = entity('3')
    const bModifié = { ...b, name: 'b2' }
    expect(changes([a, b], [bModifié, c])).toEqual({ puts: [bModifié, c], deletes: ['1'] })
  })
})

describe('détection d’absence de changement', () => {
  const base: CarnetsState = {
    version: 1,
    notebooks: [],
    sections: [],
    pages: [],
    locks: [],
    selection: { notebookId: null, sectionId: null, pageId: null },
  }

  it('considère qu’un classeur jamais écrit doit l’être', () => {
    expect(unchanged(null, base)).toBe(false)
  })

  it('reconnaît un état identique', () => {
    expect(unchanged(base, base)).toBe(true)
  })

  it('repère un changement de sélection seul', () => {
    const navigué = { ...base, selection: { notebookId: 'n1', sectionId: null, pageId: null } }
    expect(unchanged(base, navigué)).toBe(false)
  })

  it('repère un changement de contenu seul', () => {
    expect(unchanged(base, { ...base, pages: [] })).toBe(false)
  })
})
