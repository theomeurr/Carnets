import { describe, expect, it } from 'vitest'
import type { FolioState } from '../types'
import { highlight, search } from './search'

function classeur(): FolioState {
  const page = (id: string, sectionId: string, title: string, text: string) => ({
    id,
    sectionId,
    title,
    html: `<p>${text}</p>`,
    text,
    cipher: null,
    createdAt: 0,
    updatedAt: Number(id.slice(1)),
  })

  return {
    version: 1,
    notebooks: [
      { id: 'n1', name: 'Travail', color: 'indigo', createdAt: 0 },
      { id: 'n2', name: 'Personnel', color: 'rose', createdAt: 0 },
    ],
    sections: [
      { id: 's1', notebookId: 'n1', name: 'Réunions', createdAt: 0 },
      { id: 's2', notebookId: 'n2', name: 'Cuisine', createdAt: 0 },
    ],
    locks: [],
    pages: [
      page('p1', 's1', 'Réunion budget', 'Le budget est validé pour le trimestre.'),
      page('p2', 's1', 'Point équipe', 'On parle du budget la semaine prochaine.'),
      page('p3', 's2', 'Recette de pâtes', 'Faire revenir l’ail, puis ajouter les pâtes.'),
    ],
    selection: { notebookId: 'n1', sectionId: 's1', pageId: 'p1' },
  }
}

describe('recherche', () => {
  it('ne renvoie rien pour une requête vide', () => {
    expect(search(classeur(), '   ')).toEqual([])
  })

  it('cherche dans les titres et dans le contenu', () => {
    const hits = search(classeur(), 'budget')
    expect(hits.map((h) => h.page.id).sort()).toEqual(['p1', 'p2'])
  })

  it('traverse les bloc-notes', () => {
    const hits = search(classeur(), 'ail')
    expect(hits.map((h) => h.notebookName)).toEqual(['Personnel'])
  })

  it('ignore les accents et la casse', () => {
    expect(search(classeur(), 'REUNION').map((h) => h.page.id)).toEqual(['p1'])
    expect(search(classeur(), 'pates').map((h) => h.page.id)).toEqual(['p3'])
  })

  it('exige tous les mots, quel que soit leur ordre', () => {
    expect(search(classeur(), 'budget trimestre').map((h) => h.page.id)).toEqual(['p1'])
    expect(search(classeur(), 'trimestre budget').map((h) => h.page.id)).toEqual(['p1'])
    expect(search(classeur(), 'budget introuvable')).toEqual([])
  })

  it('fait passer le titre avant le corps', () => {
    // « budget » est dans le titre de p1 et seulement dans le texte de p2.
    expect(search(classeur(), 'budget')[0].page.id).toBe('p1')
  })

  it('rapporte le chemin complet du résultat', () => {
    const [hit] = search(classeur(), 'recette')
    expect([hit.notebookName, hit.sectionName]).toEqual(['Personnel', 'Cuisine'])
  })

  it('cale l’extrait sur le terme le plus long', () => {
    const [hit] = search(classeur(), 'le trimestre')
    expect(hit.snippet).toContain('trimestre')
  })

  it('respecte la limite demandée', () => {
    expect(search(classeur(), 'e', 2)).toHaveLength(2)
  })
})

describe('surlignage', () => {
  it('découpe la chaîne autour des termes trouvés', () => {
    const parts = highlight('Le budget annuel', 'budget')
    expect(parts).toEqual([
      { text: 'Le ', match: false },
      { text: 'budget', match: true },
      { text: ' annuel', match: false },
    ])
  })

  it('surligne le mot accentué cherché sans accent', () => {
    const parts = highlight('Réunion de rentrée', 'reunion')
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['Réunion'])
  })

  it('surligne chaque occurrence de chaque terme', () => {
    const parts = highlight('budget et budget', 'budget')
    expect(parts.filter((p) => p.match)).toHaveLength(2)
  })

  it('laisse la chaîne intacte sans requête', () => {
    expect(highlight('texte', '  ')).toEqual([{ text: 'texte', match: false }])
  })
})
