import { useCallback, useEffect, useState } from 'react'
import { useNarrow } from './useNarrow'

/**
 * Les volets latéraux repliés ou dépliés, retenus d'une session à l'autre.
 *
 * Le choix est propre à l'appareil et ne part pas au serveur : replier une
 * colonne sur le grand écran du bureau ne veut rien dire pour le téléphone,
 * où l'on n'en voit de toute façon qu'une à la fois.
 */
const KEY = 'folio:volets'

export interface Panels {
  sidebar: boolean
  pages: boolean
  toggle: (which: 'sidebar' | 'pages') => void
}

interface Folded {
  sidebar: boolean
  pages: boolean
}

function read(): Folded {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { sidebar: false, pages: false }
    const parsed = JSON.parse(raw) as Partial<Folded>
    return { sidebar: parsed.sidebar === true, pages: parsed.pages === true }
  } catch {
    return { sidebar: false, pages: false }
  }
}

export function usePanels(): Panels {
  const [folded, setFolded] = useState<Folded>(read)
  const narrow = useNarrow()

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(folded))
    } catch {
      // Sans stockage, les volets repartent dépliés au prochain lancement.
      // C'est une préférence d'affichage : rien à sauver ici.
    }
  }, [folded])

  const toggle = useCallback((which: 'sidebar' | 'pages') => {
    setFolded((current) => ({ ...current, [which]: !current[which] }))
  }, [])

  /*
   * Sur petit écran, un volet replié n'a pas de sens : une seule colonne est
   * visible à la fois, et la replier ne laisserait rien. Le choix est donc
   * ignoré là-bas — mais conservé, pour se retrouver intact au retour sur
   * grand écran.
   */
  return {
    sidebar: !narrow && folded.sidebar,
    pages: !narrow && folded.pages,
    toggle,
  }
}
