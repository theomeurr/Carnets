import type { FolioState, TrashedItem } from '../../types'

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
  read(): Promise<FolioState | null>
  write(previous: FolioState | null, next: FolioState): Promise<void>

  /**
   * La corbeille, à part du reste. Elle ne va pas au serveur et n'entre pas
   * dans l'état de l'application : elle n'est lue qu'à l'ouverture et quand
   * on la consulte. Un support qui ne sait pas la tenir peut rendre une liste
   * vide — on perd alors la possibilité de restaurer, pas les notes.
   */
  readTrash(): Promise<TrashedItem[]>
  writeTrash(added: TrashedItem[], removedKeys: string[]): Promise<void>
}
