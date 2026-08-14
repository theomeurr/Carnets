import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Id } from '../types'

/**
 * Réorganiser une liste en la faisant glisser.
 *
 * Écrit sur les événements « pointer » et non sur le glisser-déposer natif du
 * HTML : celui-ci ne produit aucun événement au doigt sur iOS, où la
 * fonctionnalité serait donc simplement absente. Ici, la souris et le doigt
 * suivent le même chemin.
 *
 * Les deux gestes ne s'amorcent pas pareil, et c'est voulu :
 *
 *  * **À la souris**, le déplacement commence dès qu'on bouge de quelques
 *    pixels bouton enfoncé — un clic simple reste un clic.
 *  * **Au doigt**, il faut d'abord un appui maintenu. Sans cette attente, tout
 *    défilement de la liste emporterait la ligne touchée.
 *
 * Le clavier fait la même chose sans pointeur : Alt + flèches déplace la ligne
 * qui a le focus.
 */

/** Déplacement minimal, à la souris, avant que ce ne soit plus un clic. */
const MOUSE_THRESHOLD = 5
/** Durée de l'appui maintenu qui arme le déplacement au doigt. */
const LONG_PRESS_MS = 420
/** Au-delà, un doigt qui bouge avant l'échéance voulait faire défiler. */
const TOUCH_SLOP = 12

export type DropSide = 'before' | 'after' | null

export interface Reorder {
  /** L'élément en cours de déplacement, s'il y en a un. */
  dragging: Id | null
  /** De quel côté de cette ligne la place libre est indiquée. */
  dropSide: (id: Id) => DropSide
  /** À étaler sur chaque ligne déplaçable. */
  itemProps: (id: Id) => {
    ref: (element: HTMLElement | null) => void
    onPointerDown: (event: ReactPointerEvent) => void
    onKeyDown: (event: React.KeyboardEvent) => void
  }
}

interface Session {
  id: Id
  pointerId: number
  touch: boolean
  startY: number
  armed: boolean
  timer: ReturnType<typeof setTimeout> | null
  /** L'ordre au moment de la prise, sans quoi un rendu changerait les repères. */
  others: Id[]
}

export function useReorder(ids: Id[], onMove: (id: Id, to: number) => void): Reorder {
  const nodes = useRef(new Map<Id, HTMLElement>())
  const session = useRef<Session | null>(null)
  const [dragging, setDragging] = useState<Id | null>(null)
  const [target, setTarget] = useState<number | null>(null)

  const idsRef = useRef(ids)
  idsRef.current = ids
  const moveRef = useRef(onMove)
  moveRef.current = onMove

  const stop = useCallback(() => {
    const current = session.current
    if (current?.timer) clearTimeout(current.timer)
    session.current = null
    setDragging(null)
    setTarget(null)
  }, [])

  /** La place libre sous le pointeur, comptée dans la liste sans l'élément pris. */
  const placeUnder = useCallback((others: Id[], y: number): number => {
    for (let index = 0; index < others.length; index += 1) {
      const rect = nodes.current.get(others[index])?.getBoundingClientRect()
      if (!rect) continue
      if (y < rect.top + rect.height / 2) return index
    }
    return others.length
  }, [])

  /*
   * Les écouteurs sont posés une fois pour toutes, et non au début d'un
   * déplacement. L'enfoncement de la souris ne provoque aucun rendu — il ne
   * fait que remplir une référence — donc un effet conditionné à l'état ne
   * s'exécuterait jamais à temps, et le premier mouvement serait perdu.
   */
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = session.current
      if (!current || event.pointerId !== current.pointerId) return
      const travelled = Math.abs(event.clientY - current.startY)

      if (!current.armed) {
        if (current.touch) {
          // Le doigt part avant l'échéance : c'est un défilement, pas une prise.
          if (travelled > TOUCH_SLOP) stop()
          return
        }
        if (travelled < MOUSE_THRESHOLD) return
        current.armed = true
        setDragging(current.id)
      }
      setTarget(placeUnder(current.others, event.clientY))
    }

    const onUp = (event: PointerEvent) => {
      const current = session.current
      if (!current || event.pointerId !== current.pointerId) return
      if (current.armed) {
        const to = placeUnder(current.others, event.clientY)
        moveRef.current(current.id, to)
      }
      stop()
    }

    /*
     * Le défilement de la page doit cesser pendant le déplacement. Un
     * `touch-action: none` posé après coup n'annule pas un geste déjà
     * commencé ; il faut refuser les `touchmove` un par un, ce qui exige un
     * écouteur non passif.
     */
    const holdStill = (event: TouchEvent) => {
      if (session.current?.armed) event.preventDefault()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', stop)
    document.addEventListener('touchmove', holdStill, { passive: false })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', stop)
      document.removeEventListener('touchmove', holdStill)
    }
  }, [placeUnder, stop])

  const itemProps = useCallback(
    (id: Id) => ({
      ref: (element: HTMLElement | null) => {
        if (element) nodes.current.set(id, element)
        else nodes.current.delete(id)
      },
      onPointerDown: (event: ReactPointerEvent) => {
        // Le clic droit, et tout ce qui a sa propre action — le menu « ⋯ », le
        // champ de renommage, une case à cocher — gardent la main.
        if (event.button !== 0) return
        if ((event.target as HTMLElement).closest('button, input, textarea, a, select')) return
        if (idsRef.current.length < 2) return

        const touch = event.pointerType === 'touch' || event.pointerType === 'pen'
        const others = idsRef.current.filter((candidate) => candidate !== id)
        const started: Session = {
          id,
          pointerId: event.pointerId,
          touch,
          startY: event.clientY,
          armed: false,
          timer: null,
          others,
        }
        if (touch) {
          started.timer = setTimeout(() => {
            if (session.current !== started) return
            started.armed = true
            setDragging(id)
            // Une vibration brève dit que la ligne est prise, comme ailleurs.
            navigator.vibrate?.(12)
          }, LONG_PRESS_MS)
        }
        session.current = started
        event.currentTarget.setPointerCapture?.(event.pointerId)
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
        const list = idsRef.current
        const from = list.indexOf(id)
        if (from === -1) return
        event.preventDefault()
        // `to` se compte dans la liste privée de l'élément : monter d'un cran
        // vaut `from - 1`, descendre vaut `from + 1`.
        const to = event.key === 'ArrowUp' ? from - 1 : from + 1
        if (to < 0 || to > list.length - 1) return
        moveRef.current(id, to)
      },
    }),
    [],
  )

  const dropSide = useCallback(
    (id: Id): DropSide => {
      const current = session.current
      if (!dragging || target === null || !current) return null
      if (target < current.others.length) return current.others[target] === id ? 'before' : null
      return current.others[current.others.length - 1] === id ? 'after' : null
    },
    [dragging, target],
  )

  return { dragging, dropSide, itemProps }
}
