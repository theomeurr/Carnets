import type { CarnetsState, Lock, Notebook, Page, Section } from '../../types'
import { assemble } from './assemble'
import { changes, unchanged } from './diff'
import { STATE_VERSION, type Driver } from './types'

const DB_NAME = 'carnets'
const DB_VERSION = 2

const NOTEBOOKS = 'notebooks'
const SECTIONS = 'sections'
const PAGES = 'pages'
const LOCKS = 'locks'
const META = 'meta'
const ALL_STORES = [NOTEBOOKS, SECTIONS, PAGES, LOCKS, META]

/** Clé de l'entrée du magasin `meta` qui retient la dernière page consultée. */
const SELECTION_KEY = 'selection'

/**
 * Le support principal. Chaque bloc-notes, section et page est une entrée
 * distincte : écrire ne réécrit que ce qui a bougé, là où un unique bloc JSON
 * imposait de resérialiser le classeur entier à chaque caractère.
 */
export async function openIndexedDb(): Promise<Driver> {
  const db = await open()

  return {
    kind: 'indexeddb',

    async read(): Promise<CarnetsState | null> {
      const [notebooks, sections, pages, locks, selection] = await Promise.all([
        readAll<Notebook>(db, NOTEBOOKS),
        readAll<Section>(db, SECTIONS),
        readAll<Page>(db, PAGES),
        readAll<Lock>(db, LOCKS),
        readMeta(db, SELECTION_KEY),
      ])
      if (notebooks.length === 0) return null
      return assemble(notebooks, sections, pages, locks, selection)
    },

    async write(previous: CarnetsState | null, next: CarnetsState): Promise<void> {
      if (unchanged(previous, next)) return

      const notebooks = changes(previous?.notebooks, next.notebooks)
      const sections = changes(previous?.sections, next.sections)
      const pages = changes(previous?.pages, next.pages)
      const locks = changes(previous?.locks, next.locks)

      // Une seule transaction pour l'ensemble : soit tout est écrit, soit rien
      // ne l'est, et le classeur ne peut pas rester à moitié modifié.
      const tx = db.transaction(ALL_STORES, 'readwrite')
      apply(tx.objectStore(NOTEBOOKS), notebooks)
      apply(tx.objectStore(SECTIONS), sections)
      apply(tx.objectStore(PAGES), pages)
      apply(tx.objectStore(LOCKS), locks)

      const meta = tx.objectStore(META)
      meta.put({ key: SELECTION_KEY, value: next.selection })
      meta.put({ key: 'version', value: STATE_VERSION })

      await settled(tx)
    },
  }
}

function apply<T>(store: IDBObjectStore, change: { puts: T[]; deletes: string[] }): void {
  for (const entity of change.puts) store.put(entity)
  for (const id of change.deletes) store.delete(id)
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible dans ce navigateur'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of [NOTEBOOKS, SECTIONS, PAGES, LOCKS]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Ouverture impossible'))
    // Un autre onglet retient une version antérieure de la base.
    request.onblocked = () => reject(new Error('Base verrouillée par un autre onglet'))
  })
}

function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return promised<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll())
}

async function readMeta(db: IDBDatabase, key: string): Promise<unknown> {
  const entry = await promised<{ key: string; value: unknown } | undefined>(
    db.transaction(META, 'readonly').objectStore(META).get(key),
  )
  return entry?.value
}

function promised<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error ?? new Error('Lecture impossible'))
  })
}

/** Attend la fin de la transaction : c'est elle, et non les `put`, qui valide. */
function settled(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Écriture refusée'))
    tx.onabort = () => reject(tx.error ?? new Error('Écriture annulée'))
  })
}
