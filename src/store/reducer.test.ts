import { describe, expect, it } from 'vitest'
import type { FolioState, Page, Section } from '../types'
import { reducer } from './reducer'

const notebook = (id: string) => ({ id, name: id, color: 'indigo', createdAt: 0 })
const section = (id: string, notebookId: string): Section => ({
  id,
  notebookId,
  name: id,
  createdAt: 0,
})
const page = (id: string, sectionId: string): Page => ({
  id,
  sectionId,
  title: id,
  html: '',
  text: '',
  cipher: null,
  createdAt: 0,
  updatedAt: 0,
})

/** Deux bloc-notes, deux sections chacun, deux pages dans la première section. */
function classeur(): FolioState {
  return {
    version: 1,
    notebooks: [notebook('n1'), notebook('n2')],
    sections: [section('s1', 'n1'), section('s2', 'n1'), section('s3', 'n2')],
    pages: [page('p1', 's1'), page('p2', 's1'), page('p3', 's2'), page('p4', 's3')],
    locks: [],
    selection: { notebookId: 'n1', sectionId: 's1', pageId: 'p1' },
  }
}

describe('suppressions en cascade', () => {
  it('supprime les sections et les pages du bloc-notes retiré', () => {
    const next = reducer(classeur(), { type: 'notebook/remove', id: 'n1' })
    expect(next.notebooks.map((n) => n.id)).toEqual(['n2'])
    expect(next.sections.map((s) => s.id)).toEqual(['s3'])
    expect(next.pages.map((p) => p.id)).toEqual(['p4'])
  })

  it('supprime les pages de la section retirée', () => {
    const next = reducer(classeur(), { type: 'section/remove', id: 's1' })
    expect(next.sections.map((s) => s.id)).toEqual(['s2', 's3'])
    expect(next.pages.map((p) => p.id)).toEqual(['p3', 'p4'])
  })

  it('ne touche pas aux autres bloc-notes', () => {
    const next = reducer(classeur(), { type: 'notebook/remove', id: 'n2' })
    expect(next.pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('rattrapage de la sélection', () => {
  it('rouvre la page voisine quand la page ouverte est supprimée', () => {
    const next = reducer(classeur(), { type: 'page/remove', id: 'p1' })
    expect(next.selection).toEqual({ notebookId: 'n1', sectionId: 's1', pageId: 'p2' })
  })

  it('descend jusqu’à une page valide quand la section ouverte disparaît', () => {
    const next = reducer(classeur(), { type: 'section/remove', id: 's1' })
    expect(next.selection).toEqual({ notebookId: 'n1', sectionId: 's2', pageId: 'p3' })
  })

  it('bascule sur le bloc-notes restant quand le sien disparaît', () => {
    const next = reducer(classeur(), { type: 'notebook/remove', id: 'n1' })
    expect(next.selection).toEqual({ notebookId: 'n2', sectionId: 's3', pageId: 'p4' })
  })

  it('accepte un classeur entièrement vide', () => {
    let state = reducer(classeur(), { type: 'notebook/remove', id: 'n1' })
    state = reducer(state, { type: 'notebook/remove', id: 'n2' })
    expect(state.selection).toEqual({ notebookId: null, sectionId: null, pageId: null })
  })

  it('ouvre la première page en changeant de bloc-notes', () => {
    const next = reducer(classeur(), { type: 'select', patch: { notebookId: 'n2' } })
    expect(next.selection).toEqual({ notebookId: 'n2', sectionId: 's3', pageId: 'p4' })
  })

  it('ouvre la première page en changeant de section', () => {
    const next = reducer(classeur(), { type: 'select', patch: { sectionId: 's2' } })
    expect(next.selection.pageId).toBe('p3')
  })

  it('laisse la section vide sans page ouverte', () => {
    const base = classeur()
    base.sections.push(section('s4', 'n1'))
    const next = reducer(base, { type: 'select', patch: { sectionId: 's4' } })
    expect(next.selection).toEqual({ notebookId: 'n1', sectionId: 's4', pageId: null })
  })
})

describe('écriture', () => {
  it('met à jour le contenu et la date de modification', () => {
    const next = reducer(classeur(), {
      type: 'page/write',
      id: 'p1',
      html: '<p>bonjour</p>',
      text: 'bonjour',
      now: 1234,
    })
    const written = next.pages.find((p) => p.id === 'p1')
    expect(written).toMatchObject({ html: '<p>bonjour</p>', text: 'bonjour', updatedAt: 1234 })
  })

  it('ignore une écriture identique pour ne pas relancer la sauvegarde', () => {
    const before = classeur()
    const after = reducer(before, { type: 'page/write', id: 'p1', html: '', text: '', now: 99 })
    expect(after).toBe(before)
  })

  it('ignore une écriture visant une page supprimée', () => {
    const before = classeur()
    const after = reducer(before, { type: 'page/write', id: 'zz', html: 'x', text: 'x', now: 1 })
    expect(after).toBe(before)
  })
})
