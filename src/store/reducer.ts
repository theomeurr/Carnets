import type {
  EntityKind,
  FolioState,
  Id,
  Lock,
  Notebook,
  Page,
  Section,
  Selection,
  Tombstone,
  TrashedItem,
} from '../types'

export type Action =
  | { type: 'notebook/add'; notebook: Notebook; section: Section; page: Page }
  | { type: 'notebook/rename'; id: Id; name: string; now: number }
  | { type: 'notebook/recolor'; id: Id; color: string; now: number }
  | { type: 'notebook/remove'; id: Id; now: number }
  | { type: 'section/add'; section: Section; page: Page }
  | { type: 'section/rename'; id: Id; name: string; now: number }
  | { type: 'section/remove'; id: Id; now: number }
  | { type: 'page/add'; page: Page }
  | { type: 'page/rename'; id: Id; title: string; now: number }
  | { type: 'page/write'; id: Id; html: string; text: string; now: number }
  /** Écriture d'une page sous verrou : seul le chiffré change. */
  | { type: 'page/sealed'; id: Id; cipher: string; now: number }
  | { type: 'page/remove'; id: Id; now: number }
  /** Remet en place ce qui sortait de la corbeille, daté de `now`. */
  | { type: 'trash/restore'; items: TrashedItem[]; now: number }
  | { type: 'select'; patch: Partial<Selection> }
  | { type: 'state/hydrate'; state: FolioState }
  /** Pose le verrou et remplace d'un bloc les pages par leur version chiffrée. */
  | { type: 'lock/add'; lock: Lock; pages: Page[] }
  /** Retire le verrou et rend les pages en clair. */
  | { type: 'lock/remove'; id: Id; pages: Page[]; now: number }

export function reducer(state: FolioState, action: Action): FolioState {
  switch (action.type) {
    // Le classeur relu du stockage remplace l'état de démarrage. Il repasse par
    // `settle` : la sélection mémorisée peut désigner une page disparue depuis.
    case 'state/hydrate':
      return settle(action.state)

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
          n.id === action.id ? { ...n, name: action.name, updatedAt: action.now } : n,
        ),
      })

    case 'notebook/recolor':
      return settle({
        ...state,
        notebooks: state.notebooks.map((n) =>
          n.id === action.id ? { ...n, color: action.color, updatedAt: action.now } : n,
        ),
      })

    case 'notebook/remove': {
      // Supprimer un bloc-notes emporte ses sections, et leurs pages avec elles.
      const doomedSections = state.sections.filter((s) => s.notebookId === action.id)
      const doomedIds = new Set(doomedSections.map((s) => s.id))
      const doomedPages = state.pages.filter((p) => doomedIds.has(p.sectionId))
      return settle({
        ...state,
        notebooks: state.notebooks.filter((n) => n.id !== action.id),
        sections: state.sections.filter((s) => s.notebookId !== action.id),
        pages: state.pages.filter((p) => !doomedIds.has(p.sectionId)),
        // Chaque disparition laisse sa trace : sans elle, un autre appareil
        // qui a encore ces éléments les ferait revenir à la synchronisation.
        tombstones: bury(state.tombstones, action.now, [
          ['notebook', action.id],
          ...doomedSections.map((s) => ['section', s.id] as const),
          ...doomedPages.map((p) => ['page', p.id] as const),
        ]),
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
          s.id === action.id ? { ...s, name: action.name, updatedAt: action.now } : s,
        ),
      })

    case 'section/remove': {
      const doomedPages = state.pages.filter((p) => p.sectionId === action.id)
      return settle({
        ...state,
        sections: state.sections.filter((s) => s.id !== action.id),
        pages: state.pages.filter((p) => p.sectionId !== action.id),
        tombstones: bury(state.tombstones, action.now, [
          ['section', action.id],
          ...doomedPages.map((p) => ['page', p.id] as const),
        ]),
      })
    }

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

    case 'page/sealed': {
      const page = state.pages.find((p) => p.id === action.id)
      if (!page || page.cipher === action.cipher) return state
      return settle({
        ...state,
        pages: state.pages.map((p) =>
          p.id === action.id ? { ...p, cipher: action.cipher, updatedAt: action.now } : p,
        ),
      })
    }

    case 'page/remove':
      return settle({
        ...state,
        pages: state.pages.filter((p) => p.id !== action.id),
        tombstones: bury(state.tombstones, action.now, [['page', action.id]]),
      })

    case 'lock/add':
      return settle({
        ...state,
        locks: [...state.locks, action.lock],
        pages: replacePages(state.pages, action.pages),
      })

    case 'lock/remove':
      return settle({
        ...state,
        locks: state.locks.filter((lock) => lock.id !== action.id),
        pages: replacePages(state.pages, action.pages),
        tombstones: bury(state.tombstones, action.now, [['lock', action.id]]),
      })

    /*
     * La restauration ne demande rien de particulier à la synchronisation :
     * celle-ci n'efface un objet que si sa suppression est plus récente que
     * lui. Il suffit donc de le remettre avec une date postérieure, et il
     * revient sur les autres appareils tout seul. On retire aussi la pierre
     * tombale locale — inutile désormais, et une trace en moins à relire.
     */
    case 'trash/restore': {
      const revived = action.items.map((entry) => ({
        ...entry,
        entity: { ...entry.entity, updatedAt: action.now },
      }))
      const of = (kind: EntityKind) =>
        revived.filter((entry) => entry.kind === kind).map((entry) => entry.entity)
      const back = <T extends { id: Id }>(existing: T[], fresh: T[]): T[] => {
        if (fresh.length === 0) return existing
        const ids = new Set(fresh.map((entity) => entity.id))
        return [...existing.filter((entity) => !ids.has(entity.id)), ...fresh]
      }
      const raised = new Set(revived.map((entry) => `${entry.kind}:${entry.id}`))
      const page = revived.find((entry) => entry.kind === 'page')?.entity as Page | undefined
      const section = revived.find((entry) => entry.kind === 'section')?.entity as Section | undefined
      return settle({
        ...state,
        notebooks: back(state.notebooks, of('notebook') as Notebook[]),
        sections: back(state.sections, of('section') as Section[]),
        pages: back(state.pages, of('page') as Page[]),
        locks: back(state.locks, of('lock') as Lock[]),
        tombstones: state.tombstones.filter((t) => !raised.has(`${t.kind}:${t.id}`)),
        // On ouvre ce qui vient de revenir : sans cela, la page réapparaît
        // quelque part dans le classeur sans qu'on sache où.
        selection: page
          ? { ...state.selection, sectionId: page.sectionId, pageId: page.id }
          : section
            ? { ...state.selection, notebookId: section.notebookId, sectionId: section.id }
            : state.selection,
      })
    }

    case 'select':
      return settle({ ...state, selection: { ...state.selection, ...action.patch } })

    default:
      return state
  }
}

/**
 * Ajoute des traces de suppression, en remplaçant celles qui existaient déjà
 * pour les mêmes objets — une seule trace par identifiant, la plus récente.
 */
function bury(
  existing: Tombstone[],
  deletedAt: number,
  buried: readonly (readonly [EntityKind, Id])[],
): Tombstone[] {
  if (buried.length === 0) return existing
  const fresh = buried.map(([kind, id]) => ({ id, kind, deletedAt }))
  const replaced = new Set(fresh.map((t) => `${t.kind}:${t.id}`))
  return [...existing.filter((t) => !replaced.has(`${t.kind}:${t.id}`)), ...fresh]
}

/**
 * Remplace en bloc un lot de pages, en conservant l'ordre existant. Les pages
 * absentes du lot gardent leur identité d'objet : le diff de l'enregistrement
 * n'écrira donc que celles qui ont vraiment changé.
 */
function replacePages(pages: Page[], replacements: Page[]): Page[] {
  if (replacements.length === 0) return pages
  const byId = new Map(replacements.map((page) => [page.id, page]))
  return pages.map((page) => byId.get(page.id) ?? page)
}

/**
 * Remet la sélection d'aplomb après n'importe quelle modification : on descend
 * les trois niveaux et, dès qu'un maillon ne pointe plus sur rien (supprimé,
 * ou appartenant à un autre parent), on retombe sur le premier voisin
 * disponible. C'est ce qui permet aux cas de suppression de rester triviaux :
 * chaque action retire ses données et laisse `settle` rouvrir quelque chose.
 */
function settle(state: FolioState): FolioState {
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

  // Un verrou dont la cible a été supprimée n'a plus rien à protéger.
  const locks = state.locks.filter((lock) => targetExists(state, lock))

  const current = state.selection
  if (
    locks.length === state.locks.length &&
    current.notebookId === notebookId &&
    current.sectionId === sectionId &&
    current.pageId === pageId
  ) {
    return state
  }
  return { ...state, locks, selection: { notebookId, sectionId, pageId } }
}

function targetExists(state: FolioState, lock: { scope: string; id: string }): boolean {
  if (lock.scope === 'notebook') return state.notebooks.some((n) => n.id === lock.id)
  if (lock.scope === 'section') return state.sections.some((s) => s.id === lock.id)
  return state.pages.some((p) => p.id === lock.id)
}
