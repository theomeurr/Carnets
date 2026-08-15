import { useEffect, useState } from 'react'

/**
 * Vrai sur les écrans où les trois colonnes ne tiennent pas ensemble. Le seuil
 * est celui du reste de l'application, où l'on ne montre alors qu'un panneau à
 * la fois — et où replier un volet n'aurait donc aucun sens.
 */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(max-width: 820px)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(max-width: 820px)')
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}
