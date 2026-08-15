import { describe, expect, it } from 'vitest'
import { htmlToText } from './text'
import {
  ALIGN_GAP,
  alignZones,
  extent,
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

  it('part sur un cadre de largeur ordinaire quand la page est vide', () => {
    // Pleine largeur, on ne pourrait jamais poser un second cadre à côté.
    expect(parseZones('')).toEqual([{ id: expect.any(String), x: 0, y: 0, w: 360, html: '' }])
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

describe('tout aligner', () => {
  const hauteurs: Record<string, number> = { a: 100, b: 60, c: 40 }
  const heightOf = (z: Zone) => hauteurs[z.id] ?? 50

  it('empile dans l’ordre de lecture, calé à gauche et à la même largeur', () => {
    const zones = [
      zone({ id: 'c', x: 500, y: 400 }),
      zone({ id: 'a', x: 0, y: 0 }),
      zone({ id: 'b', x: 380, y: 10 }),
    ]
    const alignés = alignZones(zones, 600, heightOf)
    expect(alignés.map((z) => z.id)).toEqual(['a', 'b', 'c'])
    expect(alignés.map((z) => z.x)).toEqual([0, 0, 0])
    expect(alignés.map((z) => z.w)).toEqual([600, 600, 600])
    // Chacun sous le précédent, séparés d'un espace constant.
    expect(alignés.map((z) => z.y)).toEqual([0, 100 + ALIGN_GAP, 100 + ALIGN_GAP + 60 + ALIGN_GAP])
  })

  it('ne perd aucun cadre', () => {
    const zones = [zone({ id: 'a' }), zone({ id: 'b', x: 400 }), zone({ id: 'c', y: 300 })]
    expect(alignZones(zones, 600, heightOf)).toHaveLength(3)
  })

  it('supporte une hauteur nulle sans empiler deux cadres au même endroit', () => {
    const zones = [zone({ id: 'x' }), zone({ id: 'y', y: 100 })]
    const alignés = alignZones(zones, 600, () => 0)
    expect(alignés[0].y).toBe(0)
    expect(alignés[1].y).toBeGreaterThan(0)
  })

  it('est sans effet une seconde fois', () => {
    const zones = [zone({ id: 'a' }), zone({ id: 'b', x: 400, y: 5 })]
    const une = alignZones(zones, 600, heightOf)
    const deux = alignZones(une, 600, heightOf)
    expect(deux).toEqual(une)
  })
})

describe('encombrement', () => {
  it('mesure la place occupée par la toile', () => {
    const zones = [zone({ x: 0, y: 0, w: 300 }), zone({ id: 'b', x: 400, y: 200, w: 250 })]
    expect(extent(zones, () => 100)).toEqual({ width: 650, height: 300 })
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
