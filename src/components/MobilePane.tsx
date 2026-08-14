import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { PaneContext, type Pane, type PaneApi } from './paneContext'

/**
 * Sur un téléphone, empiler les trois colonnes obligeait à faire défiler deux
 * listes avant d'atteindre ce qu'on est venu écrire. On en montre donc une
 * seule, et l'on descend au fil des choix — les bloc-notes, puis les pages,
 * puis la page. Le bouton de retour du bandeau remonte.
 *
 * Sur grand écran cet état existe toujours mais ne sert à rien : les trois
 * colonnes sont visibles ensemble, et le CSS ignore la classe.
 */
export function MobilePaneProvider({ children }: { children: ReactNode }) {
  const [pane, setPane] = useState<Pane>('browse')

  const back = useCallback(() => {
    setPane((current) => (current === 'editor' ? 'pages' : 'browse'))
  }, [])

  const api = useMemo<PaneApi>(() => ({ pane, show: setPane, back }), [pane, back])
  return <PaneContext.Provider value={api}>{children}</PaneContext.Provider>
}
