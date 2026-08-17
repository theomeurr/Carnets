import { describe, expect, it } from 'vitest'
import { htmlToText } from './text'
import {
  FLOW_GAP,
  ROW_TOLERANCE,
  flow,
  isBlank,
  parseZones,
  readingOrder,
  serializeZones,
  type Zone,
} from './zones'

const zone = (patch: Partial<Zone> = {}): Zone => ({
  id: 'z1',
  x: 0,
  y: 0,
  w: 300,
  html: '<p>Un cadre</p>',
  ...patch,
})

describe('relire une page', () => {
  it('rend une page écrite avant la toile comme un cadre unique', () => {
    // Le contrôle qui compte pour l'existant : rien à migrer, rien à perdre.
    const ancien = '<h2>Un titre</h2><p>Du texte.</p>'
    const zones = parseZones(ancien)
    expect(zones).toHaveLength(1)
    // Largeur nulle : le cadre suit celle de la feuille, comme avant.
    expect(zones[0]).toMatchObject({ x: 0, y: 0, w: 0, html: ancien })
  })

  it('relit les coordonnées des cadres', () => {
    const html =
      '<div data-zone="1" data-zone-id="a" data-x="20" data-y="40" data-w="250"><p>Gauche</p></div>' +
      '<div data-zone="1" data-zone-id="b" data-x="300" data-y="40" data-w="180"><p>Droite</p></div>'
    expect(parseZones(html)).toEqual([
      { id: 'a', x: 20, y: 40, w: 250, html: '<p>Gauche</p>' },
      { id: 'b', x: 300, y: 40, w: 180, html: '<p>Droite</p>' },
    ])
  })

  it('rattrape des coordonnées absentes ou absurdes', () => {
    const html = '<div data-zone="1" data-x="zzz" data-w="3"><p>x</p></div>'
    const [z] = parseZones(html)
    expect(z.x).toBe(0)
    expect(z.y).toBe(0)
    // Une largeur sous le minimum rendrait le cadre illisible.
    expect(z.w).toBeGreaterThanOrEqual(140)
  })

  it('part sur un bloc unique quand la page est vide', () => {
    expect(parseZones('')).toEqual([{ id: expect.any(String), x: 0, y: 0, w: 0, html: '' }])
  })
})

describe('réécrire une page', () => {
  it('garde une page linéaire nue quand il n’y a qu’un cadre en haut à gauche', () => {
    // Ainsi une version antérieure de Folio, ou un autre appareil pas encore
    // mis à jour, relit la page exactement comme avant.
    expect(serializeZones([zone({ html: '<p>Bonjour</p>' })])).toBe('<p>Bonjour</p>')
  })

  it('écrit les coordonnées dès qu’un cadre a été déplacé', () => {
    const html = serializeZones([zone({ x: 40, y: 20 })])
    expect(html).toContain('data-zone="1"')
    expect(html).toContain('data-x="40"')
    expect(html).toContain('data-y="20"')
  })

  it('fait un aller-retour sans rien perdre', () => {
    const zones = [
      zone({ id: 'a', x: 10, y: 0, w: 200, html: '<p>Un</p>' }),
      zone({ id: 'b', x: 240, y: 0, w: 200, html: '<p>Deux</p>' }),
    ]
    expect(parseZones(serializeZones(zones))).toEqual(zones)
  })

  it('jette les cadres restés vides', () => {
    const zones = [zone({ id: 'a', html: '<p>Gardé</p>' }), zone({ id: 'b', x: 400, html: '<p></p>' })]
    expect(parseZones(serializeZones(zones))).toHaveLength(1)
  })

  it('rend une chaîne vide quand tout est vide', () => {
    expect(serializeZones([zone({ html: '<p><br></p>' })])).toBe('')
  })

  /*
   * Ce qui permet à tout le reste de ne rien savoir de la toile : le texte
   * brut d'une page à cadres se lit comme celui d'une page ordinaire. La
   * recherche, les aperçus et l'impression continuent donc de fonctionner.
   */
  it('laisse le texte lisible pour la recherche et les aperçus', () => {
    const html = serializeZones([
      zone({ id: 'a', x: 0, y: 0, html: '<p>Premier cadre</p>' }),
      zone({ id: 'b', x: 400, y: 0, html: '<p>Second cadre</p>' }),
    ])
    expect(htmlToText(html)).toBe('Premier cadre Second cadre')
  })

  it('sort les cadres dans l’ordre de lecture, pas de création', () => {
    const html = serializeZones([
      zone({ id: 'bas', x: 0, y: 300, html: '<p>En bas</p>' }),
      zone({ id: 'haut', x: 0, y: 0, html: '<p>En haut</p>' }),
    ])
    expect(htmlToText(html)).toBe('En haut En bas')
  })
})

describe('ordre de lecture', () => {
  it('va de haut en bas', () => {
    const zones = [zone({ id: 'b', y: 200 }), zone({ id: 'a', y: 0 })]
    expect(readingOrder(zones).map((z) => z.id)).toEqual(['a', 'b'])
  })

  it('va de gauche à droite pour ce qui est sur la même ligne', () => {
    // Trois pixels d'écart ne font pas deux lignes : sans tolérance, deux
    // cadres côte à côte se liraient l'un sous l'autre.
    const zones = [zone({ id: 'droite', x: 400, y: 3 }), zone({ id: 'gauche', x: 0, y: 0 })]
    expect(readingOrder(zones).map((z) => z.id)).toEqual(['gauche', 'droite'])
  })

  it('tranche les égalités par identifiant, pour rester stable', () => {
    const zones = [zone({ id: 'b' }), zone({ id: 'a' })]
    expect(readingOrder(zones).map((z) => z.id)).toEqual(['a', 'b'])
    expect(readingOrder(readingOrder(zones)).map((z) => z.id)).toEqual(['a', 'b'])
  })
})

describe('cadre vide', () => {
  it('reconnaît ce qui n’a rien à lire', () => {
    expect(isBlank(zone({ html: '' }))).toBe(true)
    expect(isBlank(zone({ html: '<p></p>' }))).toBe(true)
    expect(isBlank(zone({ html: '<p><br></p>' }))).toBe(true)
    expect(isBlank(zone({ html: '<p>&nbsp;</p>' }))).toBe(true)
    expect(isBlank(zone({ html: '<p>a</p>' }))).toBe(false)
  })
})

describe('largeur pleine', () => {
  /*
   * Un contenu écrit avant la toile occupe toute la feuille. Cet état se note
   * zéro, et il doit survivre à l'aller-retour : le confondre avec une largeur
   * absente faisait rétrécir une note existante dès qu'un second cadre
   * apparaissait sur sa page.
   */
  it('survit à l’aller-retour quand la page gagne un second cadre', () => {
    const zones = [
      zone({ id: 'ancien', x: 0, y: 0, w: 0, html: '<p>Note existante</p>' }),
      zone({ id: 'neuf', x: 380, y: 400, w: 300, html: '<p>Ajout</p>' }),
    ]
    const relu = parseZones(serializeZones(zones))
    expect(relu.find((z) => z.id === 'ancien')!.w).toBe(0)
    expect(relu.find((z) => z.id === 'neuf')!.w).toBe(300)
  })

  it('donne la largeur par défaut à un cadre sans attribut', () => {
    const [z] = parseZones('<div data-zone="1"><p>x</p></div>')
    expect(z.w).toBe(360)
  })
})

describe('empiler les blocs', () => {
  const hauteurs: Record<string, number> = { a: 100, b: 60, c: 40 }
  const heightOf = (z: Zone) => hauteurs[z.id] ?? 50

  it('renumérote dans l’ordre du tableau, pas dans celui des coordonnées', () => {
    /*
     * Le contrôle qui compte pour la réorganisation : on vient de faire passer
     * « c » en tête, ses coordonnées disent encore le contraire. C'est le
     * tableau qui doit gagner.
     */
    const zones: Zone[] = [
      zone({ id: 'c', y: 400 }),
      zone({ id: 'a', y: 0 }),
      zone({ id: 'b', y: 200 }),
    ]
    expect(flow(zones, heightOf).map((z) => z.id)).toEqual(['c', 'a', 'b'])
  })

  it('cale tout à gauche, sur toute la largeur', () => {
    const empilés = flow([zone({ id: 'a', x: 300, w: 200 }), zone({ id: 'b', x: 40, w: 90 })], heightOf)
    expect(empilés.map((z) => z.x)).toEqual([0, 0])
    expect(empilés.map((z) => z.w)).toEqual([0, 0])
  })

  it('descend d’un bloc à l’autre, sans jamais remonter', () => {
    const empilés = flow([zone({ id: 'a' }), zone({ id: 'b' }), zone({ id: 'c' })], heightOf)
    expect(empilés[0].y).toBe(0)
    expect(empilés[1].y).toBe(100 + FLOW_GAP)
    expect(empilés[2].y).toBe(100 + FLOW_GAP + 60 + FLOW_GAP)
  })

  /*
   * Deux blocs trop rapprochés passeraient pour côte à côte, et l'ordre de
   * lecture les départagerait alors par identifiant — l'ordre voulu serait
   * perdu au rechargement. Le pas ne descend donc jamais sous la tolérance.
   */
  it('espace assez pour que l’ordre survive à la relecture, même vide', () => {
    const empilés = flow([zone({ id: 'z' }), zone({ id: 'a' }), zone({ id: 'm' })], () => 0)
    for (let i = 1; i < empilés.length; i += 1) {
      expect(empilés[i].y - empilés[i - 1].y).toBeGreaterThan(ROW_TOLERANCE)
    }
    expect(readingOrder(empilés).map((z) => z.id)).toEqual(['z', 'a', 'm'])
  })

  it('survit à l’aller-retour par le HTML', () => {
    const zones: Zone[] = [
      zone({ id: 'trois', html: '<p>Trois</p>' }),
      zone({ id: 'un', html: '<p>Un</p>' }),
      zone({ id: 'deux', html: '<p>Deux</p>' }),
    ]
    const relu = parseZones(serializeZones(flow(zones, heightOf)))
    expect(relu.map((z) => z.id)).toEqual(['trois', 'un', 'deux'])
    expect(htmlToText(serializeZones(flow(zones, heightOf)))).toBe('Trois Un Deux')
  })

  it('est sans effet une seconde fois', () => {
    const une = flow([zone({ id: 'a' }), zone({ id: 'b' })], heightOf)
    expect(flow(une, heightOf)).toEqual(une)
  })

  it('ne perd aucun bloc', () => {
    expect(flow([zone({ id: 'a' }), zone({ id: 'b' }), zone({ id: 'c' })], heightOf)).toHaveLength(3)
  })
})
