import { createContext, useContext } from 'react'

/** Le niveau montré sur petit écran, où les trois colonnes ne tiennent pas. */
export type Pane = 'browse' | 'pages' | 'editor'

export interface PaneApi {
  pane: Pane
  show: (pane: Pane) => void
  /** Remonte d'un niveau ; sans effet si l'on est déjà au premier. */
  back: () => void
}

export const PaneContext = createContext<PaneApi | null>(null)

export function useMobilePane(): PaneApi {
  const api = useContext(PaneContext)
  if (!api) throw new Error('useMobilePane doit être utilisé dans <MobilePaneProvider>')
  return api
}
