import type { CarnetsState, Id, Notebook, Page, Section, Selection } from '../types'

export type Action =
  | { type: 'notebook/add'; notebook: Notebook; section: Section; page: Page }
  | { type: 'notebook/rename'; id: Id; name: string }
  | { type: 'notebook/recolor'; id: Id; color: string }
  | { type: 'notebook/remove'; id: Id }
  | { type: 'section/add'; section: Section; page: Page }
  | { type: 'section/rename'; id: Id; name: string }
  | { type: 'section/remove'; id: Id }
  | { type: 'page/add'; page: Page }
  | { type: 'page/rename'; id: Id; title: string; now: number }
  | { type: 'page/write'; id: Id; html: string; text: string; now: number }
  | { type: 'page/remove'; id: Id }
  | { type: 'select'; patch: Partial<Selection> }

export function reducer(state: CarnetsState, action: Action): CarnetsState {
  switch (action.type) {
    case 'notebook/add': {
      const { notebook, section, page } = action
      return settle({
        ...state,
        notebooks: [...state.notebooks, notebook],
        sections: [...state.sections, section],
        pages: [...state.pages, page],
        selection: { notebookId: notebook.id, sectionId: section.id, pageId: page.id },
      })
    }

    case 'notebook/rename':
      return settle({
        ...state,
        notebooks: state.notebooks.map((n) =>
          n.id === action.id ? { ...n, name: action.name } : n,
        ),
      })

    case 'notebook/recolor':
      return settle({
        ...state,
        notebooks: state.notebooks.map((n) =>
          n.id === action.id ? { ...n, color: action.color } : n,
        ),
      })

    case 'notebook/remove': {
      // Supprimer un bloc-notes emporte ses sections, et leurs pages avec elles.
      const doomedSections = state.sections
        .filter((s) => s.notebookId === action.id)
        .map((s) => s.id)
      return settle({
        ...state,
        notebooks: state.notebooks.filter((n) => n.id !== action.id),
        sections: state.sections.filter((s) => s.notebookId !== action.id),
        pages: state.pages.filter((p) => !doomedSections.includes(p.sectionId)),
      })
    }

    case 'section/add':
      return settle({
        ...state,
        sections: [...state.sections, action.section],
        pages: [...state.pages, action.page],
        selection: {
          notebookId: action.section.notebookId,
          sectionId: action.section.id,
          pageId: action.page.id,
        },
      })

    case 'section/rename':
      return settle({
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.id ? { ...s, name: action.name } : s,
        ),
      })

    case 'section/remove':
      return settle({
        ...state,
        sections: state.sections.filter((s) => s.id !== action.id),
        pages: state.pages.filter((p) => p.sectionId !== action.id),
      })

    case 'page/add': {
      const section = state.sections.find((s) => s.id === action.page.sectionId)
      return settle({
        ...state,
        pages: [...state.pages, action.page],
        selection: {
          notebookId: section?.notebookId ?? state.selection.notebookId,
          sectionId: action.page.sectionId,
          pageId: action.page.id,
        },
      })
    }

    case 'page/rename':
      return settle({
        ...state,
        pages: state.pages.map((p) =>
          p.id === action.id ? { ...p, title: action.title, updatedAt: action.now } : p,
        ),
      })

    case 'page/write': {
      const page = state.pages.find((p) => p.id === action.id)
      // L'éditeur peut renvoyer un contenu identique (mise au point, sélection) :
      // on garde alors l'état tel quel pour ne pas déclencher une sauvegarde inutile.
      if (!page || (page.html === action.html && page.text === action.text)) return state
      return settle({
        ...state,
        pages: state.pages.map((p) =>
          p.id === action.id
            ? { ...p, html: action.html, text: action.text, updatedAt: action.now }
            : p,
        ),
      })
    }

    case 'page/remove':
      return settle({ ...state, pages: state.pages.filter((p) => p.id !== action.id) })

    case 'select':
      return settle({ ...state, selection: { ...state.selection, ...action.patch } })

    default:
      return state
  }
}

/**
 * Remet la sélection d'aplomb après n'importe quelle modification : on descend
 * les trois niveaux et, dès qu'un maillon ne pointe plus sur rien (supprimé,
 * ou appartenant à un autre parent), on retombe sur le premier voisin
 * disponible. C'est ce qui permet aux cas de suppression de rester triviaux :
 * chaque action retire ses données et laisse `settle` rouvrir quelque chose.
 */
function settle(state: CarnetsState): CarnetsState {
  const { notebooks, sections, pages } = state
  let { notebookId, sectionId, pageId } = state.selection

  if (!notebooks.some((n) => n.id === notebookId)) {
    notebookId = notebooks[0]?.id ?? null
  }

  const notebookSections = sections.filter((s) => s.notebookId === notebookId)
  if (!notebookSections.some((s) => s.id === sectionId)) {
    sectionId = notebookSections[0]?.id ?? null
  }

  const sectionPages = pages.filter((p) => p.sectionId === sectionId)
  if (!sectionPages.some((p) => p.id === pageId)) {
    pageId = sectionPages[0]?.id ?? null
  }

  const current = state.selection
  if (
    current.notebookId === notebookId &&
    current.sectionId === sectionId &&
    current.pageId === pageId
  ) {
    return state
  }
  return { ...state, selection: { notebookId, sectionId, pageId } }
}
