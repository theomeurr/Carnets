import { newId } from './id'

/**
 * Les blocs d'une page : des morceaux de texte empilés, qu'on crée un à un et
 * qu'on réordonne ensuite.
 *
 * Une page reste **un seul document HTML**, et c'est ce qui rend le reste
 * inchangé : la recherche, les aperçus, le chiffrement et la synchronisation
 * continuent de travailler sur `page.html` sans rien savoir des blocs. Ceux-ci
 * n'y sont qu'un habillage — des `<div>` qui se suivent.
 *
 * Une page écrite avant les blocs n'en a aucun : elle est relue comme un bloc
 * unique occupant toute la largeur, donc exactement telle qu'elle était. Rien
 * à migrer, et rien à perdre.
 *
 * **Les coordonnées survivent au format**, alors que plus rien ne se pose où
 * l'on veut. Elles ne servent plus qu'à deux choses : retrouver l'ordre d'une
 * page enregistrée par une version antérieure — où les blocs étaient
 * réellement posés côte à côte — et rester lisible par un appareil qui n'a pas
 * encore reçu la mise à jour. On les réécrit donc comme une simple pile.
 */

export interface Zone {
  id: string
  /** Coordonnées en pixels, depuis le coin haut-gauche de la feuille. */
  x: number
  y: number
  w: number
  /** Le contenu riche du bloc, tel que l'éditeur l'écrit. */
  html: string
}

/** Largeur notée pour un bloc dont la largeur ne vaut plus rien : la pleine. */
export const DEFAULT_WIDTH = 360
/**
 * Largeur notée pour un bloc qui prend toute la place qu'on lui donne. C'est
 * celle de tous les blocs depuis qu'ils s'empilent, et celle d'une page écrite
 * avant eux.
 */
export const FULL_WIDTH = 0

/** En deçà, un bloc ne contiendrait plus rien de lisible. */
export const MIN_WIDTH = 140
/** Espace noté entre deux blocs de la pile. */
export const FLOW_GAP = 24
/**
 * Deux blocs dont le haut ne diffère que de cela sont considérés sur la même
 * ligne : on les lit alors de gauche à droite. Cela ne concerne plus que les
 * pages enregistrées quand les blocs se posaient encore où l'on voulait.
 */
export const ROW_TOLERANCE = 40

const ATTRIBUTE = 'data-zone'

/**
 * Relit les blocs d'une page. Un contenu sans bloc — tout ce qui a été écrit
 * avant — devient un bloc unique.
 */
export function parseZones(html: string): Zone[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const marked = [...doc.body.querySelectorAll<HTMLElement>(`[${ATTRIBUTE}]`)]

  if (marked.length === 0) {
    const body = doc.body.innerHTML.trim()
    // Un bloc prend toute la largeur qu'on lui donne, page pleine ou vide.
    return [{ id: newId(), x: 0, y: 0, w: FULL_WIDTH, html: body }]
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
 * Réécrit les blocs en HTML, dans l'ordre de lecture : le texte brut qu'on en
 * tire — pour la recherche, les aperçus, l'impression — suit alors ce qu'on
 * voit à l'écran. Les blocs sortant de `flow` sont déjà dans cet ordre.
 */
export function serializeZones(zones: Zone[]): string {
  const kept = zones.filter((zone) => !isBlank(zone))
  if (kept.length === 0) return ''

  // Un bloc unique : on rend le HTML nu, ce qui garde une page linéaire
  // lisible par une version antérieure de Folio.
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
 * L'ordre dans lequel on lit une page : de haut en bas, et de gauche à droite
 * pour ce qui est sur la même ligne. La tolérance ne sert plus qu'aux pages
 * enregistrées quand les blocs se posaient encore côte à côte.
 */
export function readingOrder(zones: readonly Zone[]): Zone[] {
  return [...zones].sort((a, b) => {
    if (Math.abs(a.y - b.y) > ROW_TOLERANCE) return a.y - b.y
    return a.x - b.x || a.id.localeCompare(b.id)
  })
}

/**
 * Renumérote les blocs en pile, **dans l'ordre du tableau** — c'est lui qui
 * fait foi, puisque c'est celui que l'on réorganise à l'écran.
 *
 * Sans cela, l'ordre affiché et l'ordre relu divergeraient : `readingOrder`
 * trierait sur des ordonnées restées à leur ancienne valeur, et déferait au
 * rechargement le déplacement qu'on vient de faire.
 *
 * Les hauteurs sont mesurées à l'écran et passées ici : ce module ne connaît
 * pas le rendu. Elles ne servent qu'à écrire des ordonnées vraisemblables, de
 * quoi rester lisible par un appareil qui n'a pas encore reçu la mise à jour.
 */
export function flow(zones: readonly Zone[], heightOf: (zone: Zone) => number): Zone[] {
  let top = 0
  return zones.map((zone) => {
    const placed = { ...zone, x: 0, y: top, w: FULL_WIDTH }
    /*
     * Le pas dépasse toujours la tolérance de ligne : deux blocs trop
     * rapprochés passeraient pour côte à côte, et `readingOrder` les
     * départagerait alors par identifiant — l'ordre voulu serait perdu.
     */
    top += Math.max(heightOf(zone) + FLOW_GAP, ROW_TOLERANCE + 1)
    return placed
  })
}

/** Un bloc sans rien à lire : l'éditeur en laisse quand on en ouvre un sans écrire. */
export function isBlank(zone: Zone): boolean {
  return zone.html.replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/g, '') === ''
}

function number(raw: string | null): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

/**
 * La largeur d'un bloc relu. Zéro n'est pas « pas de largeur » mais « toute la
 * place disponible » — l'état de tous les blocs depuis qu'ils s'empilent.
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
