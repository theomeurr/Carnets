import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onCommit: (value: string) => void
  onCancel: () => void
  className?: string
  ariaLabel: string
}

/**
 * Champ de renommage sur place. Entrée valide, Échap annule, et perdre le
 * focus vaut validation — on ne perd pas une saisie parce qu'on a cliqué
 * ailleurs. Un nom vide est refusé : l'ancien reste.
 */
export function InlineRename({ value, onCommit, onCancel, className, ariaLabel }: Props) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    if (settled.current) return
    settled.current = true
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onCommit(trimmed)
    else onCancel()
  }

  const cancel = () => {
    if (settled.current) return
    settled.current = true
    onCancel()
  }

  return (
    <input
      ref={inputRef}
      className={`inline-rename ${className ?? ''}`}
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
