import type { CarnetsState } from '../../types'

/** Le numéro de format des données enregistrées. */
export const STATE_VERSION = 1

export type DriverKind = 'indexeddb' | 'localstorage'

/**
 * Le contrat d'un support d'enregistrement. `write` reçoit l'état précédemment
 * écrit en plus du nouveau : le pilote IndexedDB s'en sert pour ne toucher que
 * ce qui a changé. Un échec **doit** remonter en exception — c'est ce qui
 * permet à l'interface de dire la vérité sur l'état de la sauvegarde.
 */
export interface Driver {
  readonly kind: DriverKind
  read(): Promise<CarnetsState | null>
  write(previous: CarnetsState | null, next: CarnetsState): Promise<void>
}
