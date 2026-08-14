import type { FolioState } from '../../types'
import { assemble } from './assemble'
import { unchanged } from './diff'
import { STATE_VERSION, type Driver } from './types'

/**
 * La clé historique, seule source de la reprise vers IndexedDB. Elle garde
 * l'ancien nom de l'application : c'est sous ce nom que les données existent
 * déjà chez ceux qui s'en servaient avant.
 */
export const LEGACY_KEY = 'carnets:state'

/** Où l'ancien contenu est mis de côté une fois repris, en filet de sécurité. */
const BACKUP_KEY = 'carnets:sauvegarde-v1'

/**
 * Le support de repli, quand IndexedDB n'est pas disponible (certains modes de
 * navigation privée, stockage refusé par une politique). Il réécrit le classeur
 * entier à chaque fois et bute sur ~5 Mo — mais, contrairement à la version
 * précédente, il **signale** son échec au lieu de l'avaler.
 */
export function openLocalStorage(): Driver {
  return {
    kind: 'localstorage',

    async read(): Promise<FolioState | null> {
      return readKey(LEGACY_KEY)
    },

    async write(previous: FolioState | null, next: FolioState): Promise<void> {
      if (unchanged(previous, next)) return
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...next, version: STATE_VERSION }))
    },

    /*
     * Pas de corbeille sur ce support. Il réécrit le classeur entier à chaque
     * frappe et bute sur cinq mégaoctets : y ajouter une copie de tout ce
     * qu'on supprime avancerait la limite, et c'est le classeur vivant qui en
     * pâtirait. On y perd la restauration, pas les notes — et ce support n'est
     * de toute façon qu'un repli.
     */
    async readTrash() {
      return []
    },

    async writeTrash() {},
  }
}

/** Relit l'ancien format pour la reprise, sans revendiquer le support. */
export function readLegacy(): FolioState | null {
  return readKey(LEGACY_KEY)
}

/**
 * Range l'ancien contenu sous une autre clé après reprise. On ne le supprime
 * pas — si la reprise s'est mal passée, il reste récupérable — mais on ne le
 * relit plus jamais, donc des notes effacées ne peuvent pas ressusciter.
 */
export function archiveLegacy(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw === null) return
    localStorage.setItem(BACKUP_KEY, raw)
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // Sans droit d'écriture, l'ancienne clé reste : la reprise se contentera
    // de retrouver les mêmes notes déjà présentes dans IndexedDB.
  }
}

function readKey(key: string): FolioState | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null // stockage refusé : on démarre à vide.
  }
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<FolioState>
    if (parsed?.version !== STATE_VERSION) return null
    if (
      !Array.isArray(parsed.notebooks) ||
      !Array.isArray(parsed.sections) ||
      !Array.isArray(parsed.pages)
    ) {
      return null
    }
    return assemble(
      parsed.notebooks,
      parsed.sections,
      parsed.pages,
      Array.isArray(parsed.locks) ? parsed.locks : [],
      Array.isArray(parsed.tombstones) ? parsed.tombstones : [],
      parsed.selection,
    )
  } catch {
    return null
  }
}
