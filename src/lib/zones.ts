import { newId } from './id'

/**
 * La toile d'une page : des cadres de texte posés où l'on veut.
 *
 * Une page reste **un seul document HTML**, et c'est ce qui rend le reste
 * inchangé : la recherche, les aperçus, le chiffrement et la synchronisation
 * continuent de travailler sur `page.html` sans rien savoir de la toile. Les
 * cadres n'y sont qu'un habillage — des `<div>` porteurs de leurs coordonnées.
 *
 * Une page écrite avant la toile n'a aucun cadre : elle est relue comme un
 * cadre unique occupant toute la largeur, donc exactement telle qu'elle était.
 * Rien à migrer, et rien à perdre.
 */

export interface Zone {
  id: string
  /** Coordonnées en pixels, depuis le coin haut-gauche de la feuille. */
  x: number
  y: number
  w: number
  /** Le contenu riche du cadre, tel que l'éditeur l'écrit. */
  html: string
}

/** Largeur d'un cadre créé d'un clic. */
export const DEFAULT_WIDTH = 360
/**
 * Largeur notée pour un cadre qui n'en a pas encore : il prend alors la
 * largeur de lecture ci-dessous. C'est l'état d'une page écrite avant la
 * toile, qui doit s'ouvrir exactement telle qu'elle était.
 *
 * Cette largeur était auparavant celle de la feuille entière, et c'était une
 * erreur : le cadre couvrait toute la surface, et il ne restait nulle part où
 * cliquer pour en poser un second.
 */
export const FULL_WIDTH = 0

/** La largeur d'une colonne de texte confortable à lire. */
export const READING_WIDTH = 672
/** En deçà, un cadre ne contient plus rien de lisible. */
export const MIN_WIDTH = 140
/** Espace laissé entre deux cadres quand on les aligne. */
export const ALIGN_GAP = 24
/**
 * Deux cadres dont le haut ne diffère que de cela sont considérés sur la même
 * ligne : à l'alignement, on les lit alors de gauche à droite.
 */
export const ROW_TOLERANCE = 40

const ATTRIBUTE = 'data-zone'

/**
 * Relit les cadres d'une page. Un contenu sans cadre — tout ce qui a été
 * écrit avant — devient un cadre unique en haut à gauche.
 */
export function parseZones(html: string): Zone[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const marked = [...doc.body.querySelectorAll<HTMLElement>(`[${ATTRIBUTE}]`)]

  if (marked.length === 0) {
    const body = doc.body.innerHTML.trim()
    /*
     * Une page qui contient déjà quelque chose garde toute la largeur : elle
     * a été écrite avant la toile, et doit rester telle quelle. Une page vide
     * part au contraire sur un cadre de largeur ordinaire — sinon il couvrirait
     * la feuille entière, et l'on ne pourrait jamais en poser un à côté.
     */
    return [{ id: newId(), x: 0, y: 0, w: body ? FULL_WIDTH : DEFAULT_WIDTH, html: body }]
  }

  return marked.map((element) => ({
    id: element.getAttribute('data-zone-id') || newId(),
    x: number(element.getAttribute('data-x')),
    y: number(element.getAttribute('data-y')),
    w: width(element.getAttribute('data-w')),
    html: element.innerHTML,
  }))
}

/**
 * Réécrit les cadres en HTML. Ils sortent dans l'ordre de lecture, et non dans
 * celui où on les a créés : le texte brut qu'on en tire — pour la recherche,
 * les aperçus, l'impression — suit alors ce qu'on voit à l'écran.
 */
export function serializeZones(zones: Zone[]): string {
  const kept = zones.filter((zone) => !isBlank(zone))
  if (kept.length === 0) return ''

  // Un cadre unique posé en haut à gauche : on rend le HTML nu, ce qui garde
  // une page linéaire lisible par une version antérieure de Folio.
  if (kept.length === 1 && kept[0].x === 0 && kept[0].y === 0) return kept[0].html

  return readingOrder(kept)
    .map(
      (zone) =>
        `<div ${ATTRIBUTE}="1" data-zone-id="${escape(zone.id)}" data-x="${round(zone.x)}"` +
        ` data-y="${round(zone.y)}" data-w="${round(zone.w)}">${zone.html}</div>`,
    )
    .join('')
}

/**
 * L'ordre dans lequel on lit la toile : de haut en bas, et de gauche à droite
 * pour ce qui est sur la même ligne. Sans la tolérance, deux cadres côte à
 * côte posés à trois pixels d'écart se liraient l'un sous l'autre.
 */
export function readingOrder(zones: readonly Zone[]): Zone[] {
  return [...zones].sort((a, b) => {
    if (Math.abs(a.y - b.y) > ROW_TOLERANCE) return a.y - b.y
    return a.x - b.x || a.id.localeCompare(b.id)
  })
}

/**
 * « Tout aligner » : les cadres sont empilés dans l'ordre de lecture, calés à
 * gauche et à la même largeur. C'est le geste qui rattrape une toile devenue
 * brouillonne — on ne perd rien, on range.
 *
 * Les hauteurs sont mesurées à l'écran et passées ici : ce module ne connaît
 * pas le rendu, et une hauteur devinée décalerait tout.
 */
export function alignZones(
  zones: readonly Zone[],
  width: number,
  heightOf: (zone: Zone) => number,
): Zone[] {
  let top = 0
  return readingOrder(zones).map((zone) => {
    const placed = { ...zone, x: 0, y: top, w: width }
    top += Math.max(heightOf(zone), 1) + ALIGN_GAP
    return placed
  })
}

/**
 * Où poser un cadre ouvert d'un clic, sur une feuille large de `surface`.
 *
 * Il ne doit pas déborder à droite : quand la place manque, on le recule
 * plutôt que de le laisser dépasser du papier. Et il ne descend jamais sous
 * la largeur minimale, sans quoi un clic près du bord ouvrirait un cadre où
 * l'on ne pourrait rien lire.
 */
export function placeAt(surface: number, x: number, y: number) {
  const left = Math.min(Math.max(0, x), Math.max(0, surface - MIN_WIDTH))
  return {
    x: left,
    y: Math.max(0, y),
    w: Math.max(MIN_WIDTH, Math.min(DEFAULT_WIDTH, surface - left)),
  }
}

/** Un cadre sans rien à lire : l'éditeur en laisse quand on clique sans écrire. */
export function isBlank(zone: Zone): boolean {
  return zone.html.replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/g, '') === ''
}

/** La place qu'occupe la toile, pour dimensionner la feuille. */
export function extent(zones: readonly Zone[], heightOf: (zone: Zone) => number) {
  return {
    width: zones.reduce((most, zone) => Math.max(most, zone.x + zone.w), 0),
    height: zones.reduce((most, zone) => Math.max(most, zone.y + heightOf(zone)), 0),
  }
}

function number(raw: string | null): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

/**
 * La largeur d'un cadre relu.
 *
 * Zéro n'est pas « pas de largeur » mais « toute la feuille » : c'est l'état
 * d'un contenu écrit avant la toile. Le confondre avec une valeur absente
 * faisait rétrécir une note existante à la largeur par défaut dès qu'un
 * second cadre apparaissait sur sa page.
 */
function width(raw: string | null): number {
  if (raw === null) return DEFAULT_WIDTH
  const value = number(raw)
  if (value === FULL_WIDTH) return FULL_WIDTH
  return Math.max(MIN_WIDTH, value || DEFAULT_WIDTH)
}

const round = (value: number) => Math.round(value)

function escape(value: string): string {
  return value.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`)
}
