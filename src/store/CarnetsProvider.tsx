import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { nextColor } from '../lib/colors'
import { newId } from '../lib/id'
import type { Id, Notebook, Page, Section } from '../types'
import { CarnetsContext, type CarnetsApi, type SaveStatus } from './context'
import { reducer } from './reducer'
import { seed } from './seed'
import { load, save } from './storage'

/** Délai d'inactivité avant écriture sur disque — assez court pour être invisible. */
const SAVE_DELAY_MS = 400

/**
 * Détient l'état du classeur et l'enregistrement automatique. L'écriture est
 * différée : on repousse le minuteur à chaque frappe et on écrit dès que la
 * main s'arrête, plutôt que de sérialiser tout le classeur à chaque caractère.
 */
export function CarnetsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, () => load() ?? seed())
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Le dernier état connu, pour que le minuteur écrive la version la plus
  // récente même si d'autres frappes sont arrivées entre-temps.
  const latest = useRef(state)
  latest.current = state

  const started = useRef(false)

  useEffect(() => {
    // Le premier passage ne fait qu'installer le jeu de départ : rien à annoncer.
    if (!started.current) {
      started.current = true
      save(latest.current)
      return
    }
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      save(latest.current)
      setSavedAt(Date.now())
      setSaveStatus('saved')
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state.notebooks, state.sections, state.pages])

  // La navigation est mémorisée elle aussi, mais sans indicateur : rouvrir la
  // dernière page consultée n'est pas une modification du contenu.
  useEffect(() => {
    const timer = setTimeout(() => save(latest.current), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state.selection])

  // Un onglet fermé au milieu d'une frappe ne doit rien perdre.
  useEffect(() => {
    const flush = () => save(latest.current)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

  // Un bloc-notes neuf arrive avec une section et une page : on peut écrire
  // tout de suite, sans avoir à créer les deux niveaux à la main.
  const addNotebook = useCallback((): Notebook => {
    const now = Date.now()
    const current = latest.current
    const notebook: Notebook = {
      id: newId(),
      name: `Bloc-notes ${current.notebooks.length + 1}`,
      color: nextColor(current.notebooks.map((n) => n.color)),
      createdAt: now,
    }
    const section: Section = {
      id: newId(),
      notebookId: notebook.id,
      name: 'Section 1',
      createdAt: now,
    }
    dispatch({ type: 'notebook/add', notebook, section, page: blankPage(section.id, now) })
    return notebook
  }, [])

  const addSection = useCallback((notebookId: Id): Section => {
    const now = Date.now()
    const count = latest.current.sections.filter((s) => s.notebookId === notebookId).length
    const section: Section = {
      id: newId(),
      notebookId,
      name: `Section ${count + 1}`,
      createdAt: now,
    }
    dispatch({ type: 'section/add', section, page: blankPage(section.id, now) })
    return section
  }, [])

  // Seule une page créée explicitement mérite le curseur ; voir `claimNewPageFocus`.
  const pageAwaitingFocus = useRef<Id | null>(null)

  const addPage = useCallback((sectionId: Id): Page => {
    const page = blankPage(sectionId, Date.now())
    pageAwaitingFocus.current = page.id
    dispatch({ type: 'page/add', page })
    return page
  }, [])

  const claimNewPageFocus = useCallback((id: Id): boolean => {
    if (pageAwaitingFocus.current !== id) return false
    pageAwaitingFocus.current = null
    return true
  }, [])

  const api = useMemo<CarnetsApi>(
    () => ({
      state,
      saveStatus,
      savedAt,
      addNotebook,
      renameNotebook: (id, name) => dispatch({ type: 'notebook/rename', id, name }),
      recolorNotebook: (id, color) => dispatch({ type: 'notebook/recolor', id, color }),
      removeNotebook: (id) => dispatch({ type: 'notebook/remove', id }),
      addSection,
      renameSection: (id, name) => dispatch({ type: 'section/rename', id, name }),
      removeSection: (id) => dispatch({ type: 'section/remove', id }),
      addPage,
      claimNewPageFocus,
      renamePage: (id, title) => dispatch({ type: 'page/rename', id, title, now: Date.now() }),
      writePage: (id, html, text) =>
        dispatch({ type: 'page/write', id, html, text, now: Date.now() }),
      removePage: (id) => dispatch({ type: 'page/remove', id }),
      select: (patch) => dispatch({ type: 'select', patch }),
    }),
    [state, saveStatus, savedAt, addNotebook, addSection, addPage, claimNewPageFocus],
  )

  return <CarnetsContext.Provider value={api}>{children}</CarnetsContext.Provider>
}

/** Une page neuve : sans titre, sans contenu — l'éditeur y place le curseur. */
function blankPage(sectionId: Id, now: number): Page {
  return {
    id: newId(),
    sectionId,
    title: '',
    html: '',
    text: '',
    createdAt: now,
    updatedAt: now,
  }
}
