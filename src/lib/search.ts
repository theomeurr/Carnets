import type { CarnetsState, Page } from '../types'
import { fold } from './text'

export interface SearchHit {
  page: Page
  notebookName: string
  notebookColor: string
  sectionName: string
  /** Extrait du contenu autour de la première occurrence, ou début de page. */
  snippet: string
  score: number
}

const SNIPPET_RADIUS = 90

/**
 * Cherche dans les titres et le contenu de toutes les pages, tous bloc-notes
 * confondus. Une page est retenue si elle contient **tous** les mots de la
 * requête ; un mot trouvé dans le titre pèse plus lourd qu'un mot trouvé dans
 * le corps, et une page récemment modifiée départage les ex æquo.
 */
export function search(state: CarnetsState, query: string, limit = 30): SearchHit[] {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const notebooks = new Map(state.notebooks.map((n) => [n.id, n]))
  const sections = new Map(state.sections.map((s) => [s.id, s]))
  const hits: SearchHit[] = []

  for (const page of state.pages) {
    const section = sections.get(page.sectionId)
    const notebook = section ? notebooks.get(section.notebookId) : undefined
    if (!section || !notebook) continue

    const title = fold(page.title)
    const body = fold(page.text)

    let score = 0
    let matchesAll = true
    for (const term of terms) {
      const inTitle = title.includes(term)
      const inBody = body.includes(term)
      if (!inTitle && !inBody) {
        matchesAll = false
        break
      }
      if (inTitle) score += title.startsWith(term) ? 12 : 8
      if (inBody) score += 3
    }
    if (!matchesAll) continue

    hits.push({
      page,
      notebookName: notebook.name,
      notebookColor: notebook.color,
      sectionName: section.name,
      snippet: snippetFor(page.text, body, terms),
      score,
    })
  }

  hits.sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt)
  return hits.slice(0, limit)
}

/**
 * Découpe le texte autour du terme trouvé, sans couper de mot. L'extrait est
 * calé sur le terme le plus long : dans « citation à retrouver », le « à » se
 * rencontre partout et donnerait un extrait qui ne montre rien.
 */
function snippetFor(text: string, folded: string, terms: string[]): string {
  if (!text) return ''

  let at = -1
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    at = folded.indexOf(term)
    if (at !== -1) break
  }
  if (at === -1) return text.slice(0, SNIPPET_RADIUS * 2).trim()

  let start = Math.max(0, at - SNIPPET_RADIUS)
  let end = Math.min(text.length, at + SNIPPET_RADIUS)
  if (start > 0) {
    const space = text.indexOf(' ', start)
    if (space !== -1 && space < at) start = space + 1
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end)
    if (space > at) end = space
  }
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * Découpe une chaîne en segments marqués / non marqués. Le rendu passe ensuite
 * par des éléments React : le texte de l'utilisateur n'est jamais réinjecté
 * comme du HTML.
 */
export function highlight(value: string, query: string): { text: string; match: boolean }[] {
  const terms = [...new Set(fold(query).split(/\s+/).filter(Boolean))]
  if (terms.length === 0 || !value) return [{ text: value, match: false }]

  // `fold` conserve la longueur pour les caractères latins (NFD puis retrait
  // des diacritiques combinants) : les index restent alignés sur la chaîne
  // d'origine. Si une écriture se décompose autrement, on retombe sur une
  // comparaison sans accents pour ne pas surligner à côté.
  let folded = fold(value)
  if (folded.length !== value.length) folded = value.toLowerCase()
  const marks: boolean[] = new Array(value.length).fill(false)
  for (const term of terms) {
    let from = folded.indexOf(term)
    while (from !== -1) {
      for (let i = from; i < from + term.length && i < marks.length; i += 1) marks[i] = true
      from = folded.indexOf(term, from + term.length)
    }
  }

  const parts: { text: string; match: boolean }[] = []
  let cursor = 0
  while (cursor < value.length) {
    const state = marks[cursor]
    let end = cursor
    while (end < value.length && marks[end] === state) end += 1
    parts.push({ text: value.slice(cursor, end), match: state })
    cursor = end
  }
  return parts
}
