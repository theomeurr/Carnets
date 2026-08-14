import { describe, expect, it } from 'vitest'
import { discardedBy } from '../sync/merge'
import type { FolioState, Lock, Notebook, Page, Section } from '../types'
import { reducer } from './reducer'
import { doomedBy, expired, KEEP_MS, restoration, revivalStamp, stamp, subtree, visible } from './trash'

const T = 1_000_000

const notebook = (id: string): Notebook => ({
  id,
  name: `Bloc ${id}`,
  color: 'indigo',
  createdAt: T,
  updatedAt: T,
})
const section = (id: string, notebookId: string): Section => ({
  id,
  notebookId,
  name: `Section ${id}`,
  createdAt: T,
  updatedAt: T,
})
const page = (id: string, sectionId: string): Page => ({
  id,
  sectionId,
  title: `Page ${id}`,
  html: '<p>x</p>',
  text: 'x',
  cipher: null,
  createdAt: T,
  updatedAt: T,
})
const lock = (id: string, scope: Lock['scope']): Lock => ({
  id,
  scope,
  salt: 'sel',
  iterations: 600_000,
  verifier: 'témoin',
  createdAt: T,
  updatedAt: T,
})

/** Un classeur : deux bloc-notes, dont le premier a deux sections. */
function classeur(): FolioState {
  return {
    version: 1,
    notebooks: [notebook('n1'), notebook('n2')],
    sections: [section('s1', 'n1'), section('s2', 'n1'), section('s3', 'n2')],
    pages: [page('p1', 's1'), page('p2', 's1'), page('p3', 's2'), page('p4', 's3')],
    locks: [],
    tombstones: [],
    selection: { notebookId: 'n1', sectionId: 's1', pageId: 'p1' },
  }
}

const keys = (items: { key: string }[]) => items.map((i) => i.key).sort()

describe('ce qu’une suppression emporte', () => {
  it('une page, et rien qu’elle', () => {
    expect(keys(doomedBy(classeur(), 'page', 'p1'))).toEqual(['page:p1'])
  })

  it('une section emporte ses pages', () => {
    expect(keys(doomedBy(classeur(), 'section', 's1'))).toEqual([
      'page:p1',
      'page:p2',
      'section:s1',
    ])
  })

  it('un bloc-notes emporte ses sections et leurs pages', () => {
    expect(keys(doomedBy(classeur(), 'notebook', 'n1'))).toEqual([
      'notebook:n1',
      'page:p1',
      'page:p2',
      'page:p3',
      'section:s1',
      'section:s2',
    ])
  })

  it('emporte aussi les verrous des cibles', () => {
    const state = { ...classeur(), locks: [lock('p1', 'page'), lock('s1', 'section'), lock('n2', 'notebook')] }
    // Le verrou de `n2` ne bouge pas : ce bloc-notes n'est pas concerné.
    expect(keys(doomedBy(state, 'notebook', 'n1'))).toContain('lock:p1')
    expect(keys(doomedBy(state, 'notebook', 'n1'))).toContain('lock:s1')
    expect(keys(doomedBy(state, 'notebook', 'n1'))).not.toContain('lock:n2')
  })

  it('rend une liste vide pour ce qui n’existe pas', () => {
    expect(doomedBy(classeur(), 'page', 'inconnue')).toEqual([])
  })

  /*
   * Le contrôle qui compte. La corbeille recalcule la cascade de son côté ;
   * si l'une des deux dérivait, on garderait de côté autre chose que ce qui
   * disparaît — ou l'on perdrait des pages sans filet.
   */
  it('recueille exactement ce que le reducer retire', () => {
    for (const [kind, id] of [
      ['page', 'p1'],
      ['section', 's1'],
      ['notebook', 'n1'],
    ] as const) {
      const avant = { ...classeur(), locks: [lock('p1', 'page'), lock('s2', 'section')] }
      const recueilli = new Set(doomedBy(avant, kind, id).map((e) => e.key))
      const apres = reducer(avant, { type: `${kind}/remove`, id, now: T + 1 } as never)

      const disparus = new Set<string>()
      for (const n of avant.notebooks) if (!apres.notebooks.some((x) => x.id === n.id)) disparus.add(`notebook:${n.id}`)
      for (const s of avant.sections) if (!apres.sections.some((x) => x.id === s.id)) disparus.add(`section:${s.id}`)
      for (const p of avant.pages) if (!apres.pages.some((x) => x.id === p.id)) disparus.add(`page:${p.id}`)
      for (const l of avant.locks) if (!apres.locks.some((x) => x.id === l.id)) disparus.add(`lock:${l.id}`)

      expect([...recueilli].sort()).toEqual([...disparus].sort())
    }
  })
})

describe('remettre en place', () => {
  it('restaure une page dont la section existe encore', () => {
    const state = classeur()
    const trash = stamp(doomedBy(state, 'page', 'p1'), T + 1)
    const apres = reducer(state, { type: 'page/remove', id: 'p1', now: T + 1 })

    const items = restoration(apres, trash, trash[0])!
    expect(keys(items)).toEqual(['page:p1'])

    const remis = reducer(apres, { type: 'trash/restore', items, now: T + 2 })
    expect(remis.pages.map((p) => p.id)).toContain('p1')
    // La pierre tombale locale s'en va : elle n'a plus rien à signaler.
    expect(remis.tombstones.some((t) => t.id === 'p1')).toBe(false)
    // Et la page revient ouverte, sans quoi on ne saurait pas où elle est.
    expect(remis.selection.pageId).toBe('p1')
  })

  it('remonte les ancêtres disparus depuis la corbeille', () => {
    const state = classeur()
    const trash = stamp(doomedBy(state, 'notebook', 'n1'), T + 1)
    const apres = reducer(state, { type: 'notebook/remove', id: 'n1', now: T + 1 })
    expect(apres.notebooks.map((n) => n.id)).toEqual(['n2'])

    // On ne demande qu'une page ; le bloc-notes et la section reviennent avec.
    const cible = trash.find((e) => e.key === 'page:p3')!
    const items = restoration(apres, trash, cible)!
    expect(keys(items)).toContain('notebook:n1')
    expect(keys(items)).toContain('section:s2')

    const remis = reducer(apres, { type: 'trash/restore', items, now: T + 2 })
    expect(remis.notebooks.map((n) => n.id).sort()).toEqual(['n1', 'n2'])
    expect(remis.pages.map((p) => p.id)).toContain('p3')
  })

  it('remet un bloc-notes avec tout ce qu’il contenait', () => {
    const state = classeur()
    const trash = stamp(doomedBy(state, 'notebook', 'n1'), T + 1)
    const apres = reducer(state, { type: 'notebook/remove', id: 'n1', now: T + 1 })

    const items = restoration(apres, trash, trash.find((e) => e.key === 'notebook:n1')!)!
    const remis = reducer(apres, { type: 'trash/restore', items, now: T + 2 })
    expect(remis.sections.filter((s) => s.notebookId === 'n1')).toHaveLength(2)
    expect(remis.pages.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('ramène le verrou avec la page qu’il protégeait', () => {
    const state = { ...classeur(), locks: [lock('p1', 'page')] }
    const trash = stamp(doomedBy(state, 'page', 'p1'), T + 1)
    const apres = reducer(state, { type: 'page/remove', id: 'p1', now: T + 1 })
    expect(apres.locks).toHaveLength(0)

    const items = restoration(apres, trash, trash.find((e) => e.key === 'page:p1')!)!
    const remis = reducer(apres, { type: 'trash/restore', items, now: T + 2 })
    // Sans son verrou, la page reviendrait chiffrée et illisible.
    expect(remis.locks.map((l) => l.id)).toEqual(['p1'])
  })

  it('refuse quand plus rien ne peut accueillir la page', () => {
    const state = classeur()
    const trash = stamp(doomedBy(state, 'page', 'p1'), T + 1)
    // La section part aussi, mais sans passer par la corbeille.
    const apres = reducer(
      reducer(state, { type: 'page/remove', id: 'p1', now: T + 1 }),
      { type: 'section/remove', id: 's1', now: T + 2 },
    )
    expect(restoration(apres, trash, trash[0])).toBeNull()
  })

  it('date la remise au-delà de la suppression, même horloge en retard', () => {
    const items = stamp(doomedBy(classeur(), 'page', 'p1'), T + 5_000)
    // L'appareil qui a supprimé avait de l'avance : remettre avec l'heure
    // locale ferait perdre la restauration à la fusion suivante.
    expect(revivalStamp(items, T)).toBe(T + 5_001)
    expect(revivalStamp(items, T + 9_000)).toBe(T + 9_000)
  })

  it('la remise survit à la fusion qui rapporte la suppression', () => {
    const state = classeur()
    const trash = stamp(doomedBy(state, 'page', 'p1'), T + 1)
    const apres = reducer(state, { type: 'page/remove', id: 'p1', now: T + 1 })
    const items = restoration(apres, trash, trash[0])!
    const remis = reducer(apres, { type: 'trash/restore', items, now: revivalStamp(items, T) })

    // Le serveur renvoie la pierre tombale : la page doit rester.
    const rapporte = discardedBy(remis, {
      notebooks: [],
      sections: [],
      pages: [],
      locks: [],
      tombstones: [{ id: 'p1', kind: 'page', deletedAt: T + 1 }],
    })
    expect(rapporte).toEqual([])
  })
})

describe('ce que la fusion retire', () => {
  it('signale exactement les objets qu’une pierre tombale distante emporte', () => {
    const state = classeur()
    const parti = discardedBy(state, {
      notebooks: [],
      sections: [],
      pages: [],
      locks: [],
      tombstones: [{ id: 'p2', kind: 'page', deletedAt: T + 1 }],
    })
    expect(parti.map((d) => `${d.kind}:${d.entity.id}`)).toEqual(['page:p2'])
    expect(parti[0].deletedAt).toBe(T + 1)
  })

  it('laisse tranquille une page modifiée après la suppression', () => {
    const state = classeur()
    state.pages[1] = { ...state.pages[1], updatedAt: T + 10 }
    const parti = discardedBy(state, {
      notebooks: [],
      sections: [],
      pages: [],
      locks: [],
      tombstones: [{ id: 'p2', kind: 'page', deletedAt: T + 1 }],
    })
    expect(parti).toEqual([])
  })
})

describe('tenue de la corbeille', () => {
  it('ne montre que le sommet d’une cascade : un geste, une ligne', () => {
    const trash = stamp(doomedBy(classeur(), 'notebook', 'n1'), T + 1)
    // Six objets en corbeille, une seule ligne : le bloc-notes.
    expect(trash).toHaveLength(6)
    expect(keys(visible(trash))).toEqual(['notebook:n1'])
  })

  it('garde sa ligne à une page supprimée avant son bloc-notes', () => {
    const state = classeur()
    const seule = stamp(doomedBy(state, 'page', 'p1'), T + 1)
    const apres = reducer(state, { type: 'page/remove', id: 'p1', now: T + 1 })
    const bloc = stamp(doomedBy(apres, 'notebook', 'n1'), T + 2)
    // Deux gestes distincts : deux lignes, malgré la parenté.
    expect(keys(visible([...seule, ...bloc]))).toEqual(['notebook:n1', 'page:p1'])
  })

  it('n’affiche pas les verrous, et met le plus récent en tête', () => {
    const items = [
      ...stamp(doomedBy(classeur(), 'page', 'p1'), T + 100),
      ...stamp([...doomedBy({ ...classeur(), locks: [lock('p3', 'page')] }, 'page', 'p3')], T + 200),
    ]
    const montre = visible(items)
    expect(montre.every((e) => e.kind !== 'lock')).toBe(true)
    expect(montre[0].key).toBe('page:p3')
  })

  it('laisse partir ce qui a dépassé la durée de garde', () => {
    const vieux = stamp(doomedBy(classeur(), 'page', 'p1'), T)
    const recent = stamp(doomedBy(classeur(), 'page', 'p2'), T + KEEP_MS)
    const partants = expired([...vieux, ...recent], T + KEEP_MS)
    expect(keys(partants)).toEqual(['page:p1'])
  })

  it('une suppression définitive emporte la descendance, jamais les ancêtres', () => {
    const trash = stamp(doomedBy(classeur(), 'notebook', 'n1'), T + 1)
    const bloc = trash.find((e) => e.key === 'notebook:n1')!
    expect(keys(subtree(trash, bloc))).toEqual([
      'notebook:n1',
      'page:p1',
      'page:p2',
      'page:p3',
      'section:s1',
      'section:s2',
    ])
    // Jeter une seule page ne touche ni sa section ni son bloc-notes.
    const p1 = trash.find((e) => e.key === 'page:p1')!
    expect(keys(subtree(trash, p1))).toEqual(['page:p1'])
  })
})
