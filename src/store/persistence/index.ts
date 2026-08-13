import type { FolioState } from '../../types'
import { openIndexedDb } from './indexeddb'
import { archiveLegacy, openLocalStorage, readLegacy } from './localstorage'
import type { Driver } from './types'

export { STATE_VERSION, type Driver, type DriverKind } from './types'

export interface Opened {
  driver: Driver
  /** Le classeur relu, ou `null` s'il n'y a rien : l'appelant sème alors. */
  state: FolioState | null
  /** Vrai si des notes ont été reprises de l'ancien stockage à cette ouverture. */
  migrated: boolean
}

/**
 * Ouvre le stockage et rend le classeur. IndexedDB est le support voulu ; s'il
 * est hors service, on retombe sur `localStorage` plutôt que de refuser de
 * démarrer. Les notes écrites par la version précédente sont reprises au
 * passage, une fois, et rangées de côté ensuite.
 */
export async function openStore(): Promise<Opened> {
  try {
    const driver = await openIndexedDb()
    const stored = await driver.read()
    if (stored) return { driver, state: stored, migrated: false }

    // Base neuve : peut-être un utilisateur de la version localStorage.
    const legacy = readLegacy()
    if (legacy) {
      await driver.write(null, legacy)
      archiveLegacy()
      return { driver, state: legacy, migrated: true }
    }

    return { driver, state: null, migrated: false }
  } catch {
    const driver = openLocalStorage()
    return { driver, state: await driver.read(), migrated: false }
  }
}

/** Message lisible pour l'utilisateur à partir d'un échec d'écriture. */
export function describeFailure(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'QuotaExceededError') {
    return 'L’espace de stockage du navigateur est plein.'
  }
  if (name === 'InvalidStateError' || name === 'NotFoundError') {
    return 'La base de données locale a été fermée ou supprimée.'
  }
  return error instanceof Error && error.message ? error.message : 'Cause inconnue.'
}
