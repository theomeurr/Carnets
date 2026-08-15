import { describe, expect, it } from 'vitest'
import { lockOfPage, lockOfPageIn } from '../lib/locks'
import { merge } from '../sync/merge'
import type { FolioState, Notebook, Page, Section } from '../types'
import { appendOrder, byOrder, MIN_GAP, moveWithin, ORDER_STEP, orderOf } from './order'
import { reducer } from './reducer'

const T = 1_000_000

/** Une fratrie sans rang explicite : l'ordre vient des dates de création. */
const legacy = (ids: string[]) => ids.map((id, index) => ({ id, createdAt: T + index * 1000 }))

/** Applique un déplacement et rend l'ordre obtenu. */
function afterMove(siblings: { id: string; createdAt: number; order?: number }[], id: string, to: number) {
  const updates = moveWithin(siblings, id, to)
  const byId = new Map(updates.map((u) => [u.id, u.order]))
  return siblings
    .map((s) => (byId.has(s.id) ? { ...s, order: byId.get(s.id)! } : s))
    .sort(byOrder)
    .map((s) => s.id)
}

describe('le rang', () => {
  it('vaut la date de création tant que rien n’a été réorganisé', () => {
    expect(orderOf({ id: 'a', createdAt: 42 })).toBe(42)
    expect(orderOf({ id: 'a', createdAt: 42, order: 7 })).toBe(7)
  })

  it('retombe sur zéro plutôt que de répandre des NaN', () => {
    // `assemble` trie des entrées relues, qui peuvent être abîmées.
    expect(orderOf({ id: 'a' })).toBe(0)
    expect(orderOf({ id: 'a', createdAt: Number.NaN })).toBe(0)
    expect(orderOf({ id: 'a', order: Number.POSITIVE_INFINITY, createdAt: 5 })).toBe(5)
  })

  it('range un nouvel élément derrière les autres', () => {
    const family = [{ id: 'a', createdAt: T, order: 10 }, { id: 'b', createdAt: T, order: 20 }]
    expect(appendOrder(family, T)).toBeGreaterThan(20)
    expect(appendOrder([], T)).toBe(T)
  })

  it('range un nouvel élément derrière un frère déplacé loin en avant', () => {
    // Un rang peut dépasser l'heure courante après un déplacement : la date
    // seule ne suffirait donc pas à passer derrière.
    const family = [{ id: 'a', createdAt: T, order: T + 999_999 }]
    expect(appendOrder(family, T)).toBeGreaterThan(T + 999_999)
  })
})

describe('déplacer dans une liste', () => {
  it('remonte un élément en tête', () => {
    expect(afterMove(legacy(['a', 'b', 'c']), 'c', 0)).toEqual(['c', 'a', 'b'])
  })

  it('descend un élément en queue', () => {
    expect(afterMove(legacy(['a', 'b', 'c']), 'a', 2)).toEqual(['b', 'c', 'a'])
  })

  it('intercale au milieu', () => {
    expect(afterMove(legacy(['a', 'b', 'c', 'd']), 'd', 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('ne réécrit qu’une seule ligne', () => {
    // C'est tout l'intérêt du rang fractionnaire : un déplacement n'envoie
    // qu'une ligne au serveur, et n'entre en conflit avec rien d'autre.
    expect(moveWithin(legacy(['a', 'b', 'c', 'd', 'e']), 'e', 2)).toHaveLength(1)
  })

  it('ne fait rien quand la place demandée est déjà la sienne', () => {
    const family = legacy(['a', 'b', 'c'])
    expect(moveWithin(family, 'b', 1)).toEqual([])
    expect(moveWithin(family, 'a', 0)).toEqual([])
    expect(moveWithin(family, 'c', 2)).toEqual([])
  })

  it('descend bien d’un seul cran', () => {
    // La place `from + 1` compte dans la liste privée de l'élément : elle le
    // fait passer derrière son voisin, et n'est donc pas un immobilisme.
    const family = legacy(['a', 'b', 'c'])
    expect(afterMove(family, 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(afterMove(family, 'b', 2)).toEqual(['a', 'c', 'b'])
  })

  it('ignore un élément absent, et une place hors bornes se rabat', () => {
    expect(moveWithin(legacy(['a', 'b']), 'zzz', 0)).toEqual([])
    expect(afterMove(legacy(['a', 'b', 'c']), 'a', 99)).toEqual(['b', 'c', 'a'])
    expect(afterMove(legacy(['a', 'b', 'c']), 'c', -5)).toEqual(['c', 'a', 'b'])
  })

  it('survit à cinquante dépôts successifs au même endroit', () => {
    // Chaque dépôt divise l'espace disponible par deux ; on vérifie que la
    // renumérotation prend le relais avant que les décimales ne s'épuisent.
    let family = legacy(['a', 'b', 'c'])
    for (let round = 0; round < 50; round += 1) {
      const updates = moveWithin(family, round % 2 === 0 ? 'a' : 'c', 1)
      const byId = new Map(updates.map((u) => [u.id, u.order]))
      family = family
        .map((s) => (byId.has(s.id) ? { ...s, order: byId.get(s.id)! } : s))
        .sort(byOrder)
      // Les trois restent distincts et ordonnés.
      const ranks = family.map(orderOf)
      expect(new Set(ranks).size).toBe(3)
      expect([...ranks].sort((x, y) => x - y)).toEqual(ranks)
    }
  })

  it('renumérote la fratrie quand l’espace est épuisé', () => {
    const serrés = [
      { id: 'a', createdAt: T, order: 0 },
      { id: 'b', createdAt: T, order: MIN_GAP / 2 },
      { id: 'c', createdAt: T, order: 1 },
    ]
    const updates = moveWithin(serrés, 'c', 1)
    expect(updates).toHaveLength(3)
    expect(afterMove(serrés, 'c', 1)).toEqual(['a', 'c', 'b'])
    // Et l'espace est de nouveau franc.
    expect(updates[1].order - updates[0].order).toBe(ORDER_STEP)
  })
})

/** Un classeur de trois pages dans une section, plus une page ailleurs. */
function classeur(): FolioState {
  const page = (id: string, sectionId: string, index: number): Page => ({
    id,
    sectionId,
    title: id,
    html: '',
    text: '',
    cipher: null,
    createdAt: T + index * 1000,
    updatedAt: T,
  })
  const section = (id: string, index: number): Section => ({
    id,
    notebookId: 'n1',
    name: id,
    createdAt: T + index * 1000,
    updatedAt: T,
  })
  const notebook = (id: string, index: number): Notebook => ({
    id,
    name: id,
    color: 'indigo',
    createdAt: T + index * 1000,
    updatedAt: T,
  })
  return {
    version: 1,
    notebooks: [notebook('n1', 0), notebook('n2', 1)],
    sections: [section('s1', 0), section('s2', 1)],
    pages: [page('p1', 's1', 0), page('p2', 's1', 1), page('p3', 's1', 2), page('p9', 's2', 3)],
    locks: [],
    tombstones: [],
    selection: { notebookId: 'n1', sectionId: 's1', pageId: 'p1' },
  }
}

describe('réorganisation dans le classeur', () => {
  it('déplace une page sans toucher aux autres sections', () => {
    const après = reducer(classeur(), { type: 'reorder', kind: 'page', id: 'p3', to: 0, now: T + 9 })
    expect(après.pages.filter((p) => p.sectionId === 's1').map((p) => p.id)).toEqual([
      'p3',
      'p1',
      'p2',
    ])
    // Une seule ligne a bougé, donc une seule partira au serveur.
    expect(après.pages.filter((p) => p.updatedAt === T + 9).map((p) => p.id)).toEqual(['p3'])
    expect(après.pages.find((p) => p.id === 'p9')!.updatedAt).toBe(T)
  })

  it('déplace une section entre ses sœurs, et un bloc-notes entre les siens', () => {
    let état = reducer(classeur(), { type: 'reorder', kind: 'section', id: 's2', to: 0, now: T + 9 })
    expect(état.sections.map((s) => s.id)).toEqual(['s2', 's1'])
    état = reducer(état, { type: 'reorder', kind: 'notebook', id: 'n2', to: 0, now: T + 10 })
    expect(état.notebooks.map((n) => n.id)).toEqual(['n2', 'n1'])
  })

  /*
   * L'invariant sur lequel tout repose : l'ordre du tableau **est** celui des
   * rangs. Sans lui, deux frères créés dans la même milliseconde s'affichaient
   * dans leur ordre d'insertion pendant que le calcul les triait par
   * identifiant — et déplacer le second ne faisait rien du tout.
   */
  it('range les collections à l’entrée dans l’application', () => {
    const désordre = classeur()
    désordre.sections = [...désordre.sections].reverse()
    désordre.pages = [...désordre.pages].reverse()
    const rangé = reducer(désordre, { type: 'state/hydrate', state: désordre })
    expect(rangé.sections.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(rangé.pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p9'])
  })

  it('rend les tableaux déjà rangés tels quels', () => {
    // L'enregistrement compare par identité : des tableaux neufs lui feraient
    // réécrire tout le classeur à chaque ouverture.
    const état = classeur()
    const rangé = reducer(état, { type: 'state/hydrate', state: état })
    expect(rangé.pages).toBe(état.pages)
    expect(rangé.sections).toBe(état.sections)
  })

  it('range des frères nés dans la même milliseconde par leur rang', () => {
    /*
     * Le cas du semis, qui crée tout d'un coup : sans rang explicite, l'ordre
     * dépendrait des identifiants tirés au hasard, et l'affichage divergerait
     * du calcul de déplacement. Les identifiants sont ici à contre-sens du
     * rang, pour que seul celui-ci puisse trancher.
     */
    const état = classeur()
    état.sections = [
      { ...état.sections[0], id: 'zzz', createdAt: T, order: T },
      { ...état.sections[1], id: 'aaa', createdAt: T, order: T + 1 },
    ]
    état.pages = []
    const rangé = reducer(état, { type: 'state/hydrate', state: état })
    expect(rangé.sections.map((s) => s.id)).toEqual(['zzz', 'aaa'])
  })

  it('laisse l’état intact quand rien ne bouge', () => {
    const avant = classeur()
    expect(reducer(avant, { type: 'reorder', kind: 'page', id: 'p1', to: 0, now: T + 9 })).toBe(
      avant,
    )
    expect(reducer(avant, { type: 'reorder', kind: 'page', id: 'zzz', to: 2, now: T + 9 })).toBe(
      avant,
    )
  })

  /*
   * Le contrôle qui compte pour la synchronisation. La fusion triait sur la
   * date de création : tout classement manuel était défait au premier échange,
   * y compris celui qu'on venait de faire.
   */
  it('la fusion respecte l’ordre choisi', () => {
    const rangé = reducer(classeur(), {
      type: 'reorder',
      kind: 'page',
      id: 'p3',
      to: 0,
      now: T + 9,
    })
    const ordreVoulu = rangé.pages.filter((p) => p.sectionId === 's1').map((p) => p.id)
    expect(ordreVoulu).toEqual(['p3', 'p1', 'p2'])

    // Le serveur renvoie une page modifiée ailleurs : la fusion retrie tout.
    const fusionné = merge(rangé, {
      notebooks: [],
      sections: [],
      pages: [{ ...rangé.pages.find((p) => p.id === 'p9')!, updatedAt: T + 50 }],
      locks: [],
      tombstones: [],
    })
    expect(fusionné.pages.filter((p) => p.sectionId === 's1').map((p) => p.id)).toEqual(ordreVoulu)
  })

  it('un appareil resté sans rangs ne bouscule pas l’ordre choisi ici', () => {
    const rangé = reducer(classeur(), {
      type: 'reorder',
      kind: 'page',
      id: 'p3',
      to: 0,
      now: T + 9,
    })
    // L'autre appareil renvoie p1 telle quelle, sans rang, mais plus récente.
    const fusionné = merge(rangé, {
      notebooks: [],
      sections: [],
      pages: [{ ...classeur().pages[0], updatedAt: T + 50 }],
      locks: [],
      tombstones: [],
    })
    expect(fusionné.pages.filter((p) => p.sectionId === 's1').map((p) => p.id)).toEqual([
      'p3',
      'p1',
      'p2',
    ])
  })
})

describe('changer une page de section', () => {
  const avecVerrou = (scope: 'section' | 'page', id: string): FolioState => ({
    ...classeur(),
    locks: [
      {
        id,
        scope,
        salt: 'sel',
        iterations: 600_000,
        verifier: 'témoin',
        createdAt: T,
        updatedAt: T,
      },
    ],
  })

  it('déplace la page et la fait suivre à l’écran', () => {
    const après = reducer(classeur(), {
      type: 'page/move',
      id: 'p1',
      sectionId: 's2',
      order: T + 99,
      now: T + 9,
    })
    expect(après.pages.find((p) => p.id === 'p1')!.sectionId).toBe('s2')
    expect(après.pages.filter((p) => p.sectionId === 's1').map((p) => p.id)).toEqual(['p2', 'p3'])
    // La page ouverte suit, sinon elle disparaîtrait sans qu'on sache où.
    expect(après.selection).toMatchObject({ sectionId: 's2', pageId: 'p1' })
  })

  it('ne réécrit que la page déplacée', () => {
    const après = reducer(classeur(), {
      type: 'page/move',
      id: 'p1',
      sectionId: 's2',
      order: T + 99,
      now: T + 9,
    })
    expect(après.pages.filter((p) => p.updatedAt === T + 9).map((p) => p.id)).toEqual(['p1'])
  })

  it('ignore une section inconnue ou un aller-retour sur place', () => {
    const avant = classeur()
    const args = { type: 'page/move', order: T, now: T + 9 } as const
    expect(reducer(avant, { ...args, id: 'p1', sectionId: 'inconnue' })).toBe(avant)
    expect(reducer(avant, { ...args, id: 'p1', sectionId: 's1' })).toBe(avant)
    expect(reducer(avant, { ...args, id: 'zzz', sectionId: 's2' })).toBe(avant)
  })

  /*
   * Le garde-fou qui compte. Le contenu d'une page protégée est chiffré avec
   * la clé du verrou qui la couvre : la faire passer sous un autre la rendrait
   * illisible pour toujours.
   */
  it('sait quel verrou couvrirait la page ailleurs', () => {
    const état = avecVerrou('section', 's2')
    const page = état.pages.find((p) => p.id === 'p1')!
    // Chez elle, aucun verrou ; dans s2, celui de la section.
    expect(lockOfPage(état, page)).toBeUndefined()
    expect(lockOfPageIn(état, page, 's2')?.id).toBe('s2')
  })

  it('un verrou posé sur la page la suit partout', () => {
    const état = avecVerrou('page', 'p1')
    const page = état.pages.find((p) => p.id === 'p1')!
    // Le verrou propre à la page l'emporte : le déplacement ne change rien.
    expect(lockOfPage(état, page)?.id).toBe('p1')
    expect(lockOfPageIn(état, page, 's2')?.id).toBe('p1')
  })
})
