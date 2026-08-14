import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { nextColor } from '../lib/colors'
import { newId } from '../lib/id'
import { lockOfPage } from '../lib/locks'
import type { EntityKind, FolioState, Id, Notebook, Page, Section, TrashedItem } from '../types'
import { FolioContext, type FolioApi, type SaveState, type TrashApi } from './context'
import { describeFailure, openStore, STATE_VERSION, type Driver } from './persistence'
import { unchanged } from './persistence/diff'
import { reducer } from './reducer'
import { seed } from './seed'
import {
  doomedBy,
  expired,
  restoration,
  revivalStamp,
  stamp,
  subtree,
  visible,
} from './trash'
import { useSync } from '../sync/useSync'
import { useVault } from './useVault'

/** Délai d'inactivité avant écriture — assez court pour être invisible. */
const SAVE_DELAY_MS = 400

const EMPTY: FolioState = {
  version: STATE_VERSION,
  notebooks: [],
  sections: [],
  pages: [],
  locks: [],
  tombstones: [],
  selection: { notebookId: null, sectionId: null, pageId: null },
}

/**
 * Détient l'état du classeur et son enregistrement. L'écriture est différée :
 * on repousse le minuteur à chaque frappe et on écrit dès que la main s'arrête,
 * puis le pilote ne touche que les entrées réellement modifiées.
 */
export function FolioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const [ready, setReady] = useState(false)
  const [trash, setTrash] = useState<TrashedItem[]>([])
  const [save, setSave] = useState<SaveState>({
    status: 'saved',
    at: null,
    reason: null,
    driver: null,
  })

  // Le dernier état connu, pour que le minuteur écrive la version la plus
  // récente même si d'autres frappes sont arrivées entre-temps.
  const latest = useRef(state)
  latest.current = state

  const driver = useRef<Driver | null>(null)
  /** Le dernier état réellement écrit : c'est la base de comparaison du diff. */
  const persisted = useRef<FolioState | null>(null)
  /** Les écritures se suivent à la queue leu leu, jamais en parallèle. */
  const queue = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ----- Ouverture du stockage -----

  useEffect(() => {
    let cancelled = false
    openStore().then(async ({ driver: opened, state: stored }) => {
      if (cancelled) return
      driver.current = opened
      // Sans classeur relu, on sème — et `persisted` reste nul, ce qui fera
      // écrire le jeu de départ en entier à la première sauvegarde.
      persisted.current = stored
      dispatch({ type: 'state/hydrate', state: stored ?? seed() })
      setSave((current) => ({ ...current, driver: opened.kind }))
      setReady(true)

      // La corbeille se vide d'elle-même passé le délai de garde. On le fait à
      // l'ouverture : c'est le seul moment où l'on est sûr de la relire, et
      // rien ne presse.
      const kept = await opened.readTrash().catch(() => [])
      if (cancelled) return
      const gone = expired(kept, Date.now())
      if (gone.length > 0) {
        void opened.writeTrash([], gone.map((entry) => entry.key)).catch(() => {})
      }
      const goneKeys = new Set(gone.map((entry) => entry.key))
      setTrash(kept.filter((entry) => !goneKeys.has(entry.key)))
    })
    return () => {
      cancelled = true
    }
  }, [])

  // ----- Enregistrement -----

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!driver.current) return

    queue.current = queue.current.then(async () => {
      const target = latest.current
      // Rien n'a bougé depuis la dernière écriture réussie.
      if (unchanged(persisted.current, target)) return
      try {
        await driver.current!.write(persisted.current, target)
        persisted.current = target
        setSave((current) => ({ ...current, status: 'saved', at: Date.now(), reason: null }))
      } catch (error) {
        // On ne met pas `persisted` à jour : la prochaine tentative réessaiera
        // d'écrire les mêmes modifications, sans les perdre.
        setSave((current) => ({ ...current, status: 'error', reason: describeFailure(error) }))
      }
    })
  }, [])

  const schedule = useCallback(
    (announce: boolean) => {
      if (!ready || unchanged(persisted.current, latest.current)) return
      if (announce) setSave((current) => ({ ...current, status: 'saving' }))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_DELAY_MS)
    },
    [ready, flush],
  )

  useEffect(() => {
    schedule(true)
  }, [state.notebooks, state.sections, state.pages, state.locks, state.tombstones, schedule])

  // La navigation est mémorisée elle aussi, mais sans indicateur : rouvrir la
  // dernière page consultée n'est pas une modification du contenu.
  useEffect(() => {
    schedule(false)
  }, [state.selection, schedule])

  // Quitter la page écrit immédiatement ce qui reste en attente. IndexedDB étant
  // asynchrone, la transaction n'est pas garantie de se terminer si l'onglet est
  // tué net — d'où le déclenchement dès la mise en arrière-plan, bien avant la
  // fermeture, plutôt qu'au seul `beforeunload`.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [flush])

  // ----- Actions -----

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
      updatedAt: now,
    }
    const section: Section = {
      id: newId(),
      notebookId: notebook.id,
      name: 'Section 1',
      createdAt: now,
      updatedAt: now,
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
      updatedAt: now,
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

  // ----- La corbeille -----

  /*
   * Ce qu'on jette est mis de côté avant de partir. Le calcul se fait ici, sur
   * l'état d'avant, plutôt que dans le reducer : celui-ci reste pur et ignore
   * la corbeille, qui est une affaire d'appareil et ne se synchronise pas.
   */
  const bin = useCallback((items: TrashedItem[]) => {
    if (items.length === 0) return
    setTrash((current) => {
      const keys = new Set(items.map((entry) => entry.key))
      return [...current.filter((entry) => !keys.has(entry.key)), ...items]
    })
    void driver.current?.writeTrash(items, []).catch(() => {
      // Sans corbeille, la suppression a tout de même eu lieu : on ne bloque
      // pas le geste demandé pour un filet de sécurité indisponible.
    })
  }, [])

  const discard = useCallback(
    (kind: EntityKind, id: Id) => {
      const now = Date.now()
      bin(stamp(doomedBy(latest.current, kind, id), now))
      return now
    },
    [bin],
  )

  const forget = useCallback((keys: string[]) => {
    if (keys.length === 0) return
    const gone = new Set(keys)
    setTrash((current) => current.filter((entry) => !gone.has(entry.key)))
    void driver.current?.writeTrash([], keys).catch(() => {})
  }, [])

  const vault = useVault(latest, dispatch)
  const sync = useSync(latest, dispatch, ready, bin)

  // Écrire une page passe par le coffre : si elle est sous un verrou ouvert,
  // c'est le chiffré qui part en base, jamais le texte en clair.
  const writePage = useCallback(
    (id: Id, html: string, text: string) => {
      const page = latest.current.pages.find((candidate) => candidate.id === id)
      const title = page ? (vault.reveal(page)?.title ?? '') : ''
      void vault.seal(id, { title, html, text }).then((sealed) => {
        if (!sealed) dispatch({ type: 'page/write', id, html, text, now: Date.now() })
      })
    },
    [vault],
  )

  // Le titre d'une page protégée fait partie du chiffré : le renommer suit donc
  // le même chemin que le contenu.
  const renamePage = useCallback(
    (id: Id, title: string) => {
      const page = latest.current.pages.find((candidate) => candidate.id === id)
      const current = page ? vault.reveal(page) : null
      if (page && lockOfPage(latest.current, page) && current) {
        void vault.seal(id, { ...current, title })
        return
      }
      dispatch({ type: 'page/rename', id, title, now: Date.now() })
    },
    [vault],
  )

  const trashApi = useMemo<TrashApi>(
    () => ({
      items: visible(trash),
      unavailable: driver.current?.kind === 'localstorage',
      restore: (key) => {
        const entry = trash.find((candidate) => candidate.key === key)
        if (!entry) return false
        const items = restoration(latest.current, trash, entry)
        if (!items) return false
        dispatch({ type: 'trash/restore', items, now: revivalStamp(items, Date.now()) })
        forget(items.map((item) => item.key))
        return true
      },
      purge: (key) => {
        // Une entrée jetée pour de bon emporte ce qu'elle contenait : garder
        // les pages d'un bloc-notes disparu ne servirait plus à rien.
        const entry = trash.find((candidate) => candidate.key === key)
        if (!entry) return
        forget(subtree(trash, entry).map((item) => item.key))
      },
      empty: () => forget(trash.map((entry) => entry.key)),
    }),
    [trash, forget],
  )

  const api = useMemo<FolioApi>(
    () => ({
      state,
      save,
      vault,
      sync,
      trash: trashApi,
      addNotebook,
      renameNotebook: (id, name) =>
        dispatch({ type: 'notebook/rename', id, name, now: Date.now() }),
      recolorNotebook: (id, color) =>
        dispatch({ type: 'notebook/recolor', id, color, now: Date.now() }),
      removeNotebook: (id) =>
        dispatch({ type: 'notebook/remove', id, now: discard('notebook', id) }),
      addSection,
      renameSection: (id, name) =>
        dispatch({ type: 'section/rename', id, name, now: Date.now() }),
      removeSection: (id) => dispatch({ type: 'section/remove', id, now: discard('section', id) }),
      addPage,
      claimNewPageFocus,
      renamePage,
      writePage,
      removePage: (id) => dispatch({ type: 'page/remove', id, now: discard('page', id) }),
      select: (patch) => dispatch({ type: 'select', patch }),
    }),
    [
      state,
      save,
      vault,
      sync,
      trashApi,
      discard,
      addNotebook,
      addSection,
      addPage,
      claimNewPageFocus,
      renamePage,
      writePage,
    ],
  )

  // Tant que le classeur n'est pas relu, l'interface n'a rien de sensé à
  // montrer : afficher des colonnes vides ferait croire à des notes perdues.
  if (!ready) return <BootScreen />

  return <FolioContext.Provider value={api}>{children}</FolioContext.Provider>
}

function BootScreen() {
  return (
    <div className="boot" role="status" aria-live="polite">
      <span className="boot__spinner" aria-hidden="true" />
      <p>Ouverture de vos notes…</p>
    </div>
  )
}

/** Une page neuve : sans titre, sans contenu — l'éditeur y place le curseur. */
function blankPage(sectionId: Id, now: number): Page {
  return {
    id: newId(),
    sectionId,
    title: '',
    html: '',
    text: '',
    cipher: null,
    createdAt: now,
    updatedAt: now,
  }
}
