import { createContext } from 'react'
import type { FolioState, Id, Notebook, Page, Section, Selection, TrashedItem } from '../types'

import type { DriverKind } from './persistence'
import type { SyncApi } from '../sync/useSync'
import type { Vault } from './useVault'

export type SaveStatus = 'saved' | 'saving' | 'error'

export interface SaveState {
  status: SaveStatus
  /** Dernier enregistrement réussi. */
  at: number | null
  /** Renseigné quand `status` vaut `error` : ce qui a empêché l'écriture. */
  reason: string | null
  /** Le support réellement utilisé — IndexedDB, ou le repli localStorage. */
  driver: DriverKind | null
}

/**
 * Tout ce que l'interface a le droit de faire sur le classeur. Les composants
 * ne voient jamais `dispatch` : ils appellent une action nommée, et celles qui
 * créent quelque chose renvoient l'objet créé pour pouvoir l'enchaîner (passer
 * la nouvelle section en mode renommage, par exemple).
 */
export interface FolioApi {
  state: FolioState
  /** Où en est l'enregistrement — y compris quand il échoue. */
  save: SaveState
  /** Les verrous, les clés de la session, et le contenu déchiffré. */
  vault: Vault
  /** Le compte et la synchronisation — inertes tant qu'on n'est pas connecté. */
  sync: SyncApi

  addNotebook: () => Notebook
  renameNotebook: (id: Id, name: string) => void
  recolorNotebook: (id: Id, color: string) => void
  removeNotebook: (id: Id) => void

  addSection: (notebookId: Id) => Section
  renameSection: (id: Id, name: string) => void
  removeSection: (id: Id) => void

  addPage: (sectionId: Id) => Page
  /**
   * Vrai une seule fois, pour la page que `addPage` vient de créer : c'est ce
   * qui autorise l'éditeur à prendre le curseur. Une page vide arrivée avec un
   * nouveau bloc-notes ou une nouvelle section ne le réclame pas — le curseur
   * appartient alors au champ de renommage.
   */
  claimNewPageFocus: (id: Id) => boolean
  renamePage: (id: Id, title: string) => void
  writePage: (id: Id, html: string, text: string) => void
  removePage: (id: Id) => void

  /**
   * Déplace un élément à la place `to` parmi ses frères : les bloc-notes entre
   * eux, les sections d'un bloc-notes, les pages d'une section.
   */
  reorder: (kind: 'notebook' | 'section' | 'page', id: Id, to: number) => void

  /** La corbeille : ce qui a été supprimé et qu'on peut encore remettre. */
  trash: TrashApi

  select: (patch: Partial<Selection>) => void
}

export interface TrashApi {
  /** Les pages, sections et bloc-notes supprimés, du plus récent au plus ancien. */
  items: TrashedItem[]
  /** Vrai quand le support ne sait pas tenir de corbeille (repli localStorage). */
  unavailable: boolean
  /**
   * Remet l'élément en place, avec ses ancêtres disparus s'il en manque.
   * Rend `false` quand plus rien ne peut l'accueillir.
   */
  restore: (key: string) => boolean
  /** Supprime définitivement une entrée. */
  purge: (key: string) => void
  empty: () => void
}

export const FolioContext = createContext<FolioApi | null>(null)
