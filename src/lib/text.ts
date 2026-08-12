/**
 * Version comparable d'une chaîne : minuscules, sans accents. La recherche
 * l'utilise des deux côtés pour que « resume » trouve « résumé ».
 */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre'

/**
 * Texte brut extrait d'un fragment HTML. Sert à indexer les pages du jeu de
 * départ ; en cours de frappe, c'est l'éditeur qui fournit directement le texte.
 */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Chaque bloc est relevé séparément : sans cela, la fin d'un titre et le
  // début du paragraphe suivant se colleraient dans les aperçus et les extraits.
  // Seuls les blocs les plus internes sont lus, pour ne pas compter deux fois
  // le texte d'une citation ou d'un élément de liste qui enveloppe un paragraphe.
  const blocks = [...doc.body.querySelectorAll(BLOCKS)].filter(
    (node) => node.querySelector(BLOCKS) === null,
  )
  const parts = blocks.length > 0 ? blocks.map((node) => node.textContent ?? '') : [doc.body.textContent ?? '']
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Titre affiché : le titre saisi, ou un repli quand la page n'en a pas encore. */
export function displayTitle(title: string): string {
  const trimmed = title.trim()
  return trimmed.length > 0 ? trimmed : 'Page sans titre'
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  if (sameDay) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
}
