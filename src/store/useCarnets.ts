import { useContext, useMemo } from 'react'
import type { Notebook, Page, Section } from '../types'
import { CarnetsContext, type CarnetsApi } from './context'

export function useCarnets(): CarnetsApi {
  const api = useContext(CarnetsContext)
  if (!api) throw new Error('useCarnets doit être utilisé dans <CarnetsProvider>')
  return api
}

export interface CurrentView {
  notebook: Notebook | null
  section: Section | null
  page: Page | null
  /** Les sections du bloc-notes ouvert, dans l'ordre d'affichage. */
  sections: Section[]
  /** Les pages de la section ouverte, dans l'ordre d'affichage. */
  pages: Page[]
}

/** Ce que les trois colonnes ont besoin de savoir, dérivé de la sélection. */
export function useCurrentView(): CurrentView {
  const { state } = useCarnets()
  const { notebooks, sections, pages, selection } = state

  return useMemo(() => {
    const notebook = notebooks.find((n) => n.id === selection.notebookId) ?? null
    const notebookSections = notebook ? sections.filter((s) => s.notebookId === notebook.id) : []
    const section = notebookSections.find((s) => s.id === selection.sectionId) ?? null
    const sectionPages = section ? pages.filter((p) => p.sectionId === section.id) : []
    const page = sectionPages.find((p) => p.id === selection.pageId) ?? null
    return { notebook, section, page, sections: notebookSections, pages: sectionPages }
  }, [notebooks, sections, pages, selection])
}

/** Nombre de pages contenues dans une section — affiché en pastille. */
export function usePageCounts(): Map<string, number> {
  const { state } = useCarnets()
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const page of state.pages) {
      counts.set(page.sectionId, (counts.get(page.sectionId) ?? 0) + 1)
    }
    return counts
  }, [state.pages])
}
