import { describe, expect, it } from 'vitest'
import type { FolioState, Notebook, Page, Section } from '../types'
import { localChanges, merge, type Changeset } from './merge'

const notebook = (id: string, name: string, updatedAt: number): Notebook => ({
  id,
  name,
  color: 'indigo',
  createdAt: 0,
  updatedAt,
})
const section = (id: string, name: string, updatedAt: number): Section => ({
  id,
  notebookId: 'n1',
  name,
  createdAt: 0,
  updatedAt,
})
const page = (id: string, title: string, updatedAt: number, createdAt = 0): Page => ({
  id,
  sectionId: 's1',
  title,
  html: `<p>${title}</p>`,
  text: title,
  cipher: null,
  createdAt,
  updatedAt,
})

function classeur(over: Partial<FolioState> = {}): FolioState {
  return {
    version: 1,
    notebooks: [notebook('n1', 'Travail', 10)],
    sections: [section('s1', 'Réunions', 10)],
    pages: [page('p1', 'Budget', 10)],
    locks: [],
    tombstones: [],
    selection: { notebookId: 'n1', sectionId: 's1', pageId: 'p1' },
    ...over,
  }
}

const rien: Changeset = { notebooks: [], sections: [], pages: [], locks: [], tombstones: [] }

describe('ce qui reste à envoyer', () => {
  it('ne retient que ce qui a bougé depuis la dernière synchronisation', () => {
    const state = classeur({ pages: [page('p1', 'Budget', 10), page('p2', 'Neuve', 50)] })
    expect(localChanges(state, 20).pages.map((p) => p.id)).toEqual(['p2'])
  })

  it('emporte les suppressions récentes', () => {
    const state = classeur({
      tombstones: [
        { id: 'vieux', kind: 'page', deletedAt: 5 },
        { id: 'recent', kind: 'page', deletedAt: 50 },
      ],
    })
    expect(localChanges(state, 20).tombstones.map((t) => t.id)).toEqual(['recent'])
  })
})

describe('fusion', () => {
  it('ajoute ce que l’autre appareil a créé', () => {
    const next = merge(classeur(), { ...rien, pages: [page('p9', 'Venue d’ailleurs', 30)] })
    expect(next.pages.map((p) => p.id)).toEqual(['p1', 'p9'])
  })

  it('garde la version la plus récente d’une même page', () => {
    const next = merge(classeur(), { ...rien, pages: [page('p1', 'Version distante', 99)] })
    expect(next.pages[0].title).toBe('Version distante')
  })

  it('ignore une version distante plus ancienne', () => {
    const next = merge(classeur(), { ...rien, pages: [page('p1', 'Vieille version', 2)] })
    expect(next.pages[0].title).toBe('Budget')
  })

  it('conserve la version locale à date égale, pour rester stable si on rejoue', () => {
    const next = merge(classeur(), { ...rien, pages: [page('p1', 'Autre', 10)] })
    expect(next.pages[0].title).toBe('Budget')
  })

  it('ne recrée rien quand rien n’arrive', () => {
    const state = classeur()
    // Même référence : le diff de l'enregistrement n'écrira donc rien.
    expect(merge(state, rien).pages).toBe(state.pages)
  })

  it('respecte l’ordre de création des éléments reçus', () => {
    const state = classeur({ pages: [page('p2', 'Deuxième', 10, 200)] })
    const next = merge(state, { ...rien, pages: [page('p1', 'Première', 10, 100)] })
    expect(next.pages.map((p) => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('suppressions', () => {
  it('retire localement ce qu’un autre appareil a supprimé', () => {
    const next = merge(classeur(), {
      ...rien,
      tombstones: [{ id: 'p1', kind: 'page', deletedAt: 30 }],
    })
    expect(next.pages).toEqual([])
  })

  it('ne fait pas revenir une page supprimée ici et encore présente là-bas', () => {
    // Le cas qui casse une synchronisation naïve : l'autre appareil pousse
    // une page qu'il a encore, alors qu'on vient de la supprimer.
    const state = classeur({
      pages: [],
      tombstones: [{ id: 'p1', kind: 'page', deletedAt: 30 }],
    })
    const next = merge(state, { ...rien, pages: [page('p1', 'Budget', 10)] })
    expect(next.pages).toEqual([])
  })

  it('laisse revivre une page recréée après sa suppression', () => {
    const state = classeur({
      pages: [],
      tombstones: [{ id: 'p1', kind: 'page', deletedAt: 30 }],
    })
    const next = merge(state, { ...rien, pages: [page('p1', 'Réécrite depuis', 60)] })
    expect(next.pages.map((p) => p.title)).toEqual(['Réécrite depuis'])
  })

  it('fait primer la suppression sur une modification de même date', () => {
    const next = merge(classeur(), {
      ...rien,
      tombstones: [{ id: 'p1', kind: 'page', deletedAt: 10 }],
    })
    expect(next.pages).toEqual([])
  })

  it('distingue une page et le verrou qui porte le même identifiant', () => {
    const state = classeur({
      locks: [
        {
          id: 'p1',
          scope: 'page',
          salt: 'sel',
          iterations: 1,
          verifier: 'témoin',
          createdAt: 0,
          updatedAt: 10,
        },
      ],
    })
    // On supprime le verrou, pas la page.
    const next = merge(state, { ...rien, tombstones: [{ id: 'p1', kind: 'lock', deletedAt: 30 }] })
    expect(next.locks).toEqual([])
    expect(next.pages.map((p) => p.id)).toEqual(['p1'])
  })

  it('retient la suppression la plus récente des deux côtés', () => {
    const state = classeur({ tombstones: [{ id: 'p1', kind: 'page', deletedAt: 30 }] })
    const next = merge(state, {
      ...rien,
      tombstones: [{ id: 'p1', kind: 'page', deletedAt: 80 }],
    })
    expect(next.tombstones).toEqual([{ id: 'p1', kind: 'page', deletedAt: 80 }])
  })
})

describe('deux appareils, bout en bout', () => {
  it('converge vers le même classeur quel que soit l’ordre', () => {
    // A crée une page, B en renomme une autre, chacun hors ligne.
    const a = classeur({ pages: [page('p1', 'Budget', 10), page('pA', 'Écrite par A', 40)] })
    const b = classeur({ pages: [page('p1', 'Renommée par B', 50)] })

    const aPuisB = merge(a, localChanges(b, 0))
    const bPuisA = merge(b, localChanges(a, 0))

    const titres = (s: FolioState) => s.pages.map((p) => `${p.id}:${p.title}`).sort()
    expect(titres(aPuisB)).toEqual(titres(bPuisA))
    expect(titres(aPuisB)).toEqual(['p1:Renommée par B', 'pA:Écrite par A'])
  })

  it('converge aussi quand l’un supprime ce que l’autre modifie', () => {
    const a = classeur({ pages: [], tombstones: [{ id: 'p1', kind: 'page', deletedAt: 60 }] })
    const b = classeur({ pages: [page('p1', 'Modifiée par B', 50)] })

    const aPuisB = merge(a, localChanges(b, 0))
    const bPuisA = merge(b, localChanges(a, 0))

    expect(aPuisB.pages).toEqual([])
    expect(bPuisA.pages).toEqual([])
  })
})
