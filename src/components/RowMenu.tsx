import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NOTEBOOK_COLORS } from '../lib/colors'
import { IconLock, IconMore, IconPalette, IconPencil, IconTrash, IconUnlock } from './Icons'
import type { LockControls } from './useLockMenu'

export interface RowMenuProps {
  label: string
  onRename: () => void
  onDelete: () => void
  /** Fourni pour les bloc-notes seulement : ajoute le choix de la couleur. */
  color?: { value: string; onChange: (color: string) => void }
  lock?: LockControls
}

/**
 * Le menu « ⋯ » d'une ligne : renommer, recolorer, supprimer. Il se ferme au
 * clic à l'extérieur, à Échap, et rend le focus au bouton qui l'a ouvert.
 */
export function RowMenu({ label, onRename, onDelete, color, lock }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const run = (action: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    setOpen(false)
    action()
  }

  return (
    <div className="row-menu" ref={wrapper}>
      <button
        ref={button}
        type="button"
        className="row-menu__trigger"
        aria-label={`Actions pour ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        <IconMore />
      </button>

      {open && (
        <div className="row-menu__panel" id={menuId} role="menu">
          <MenuItem icon={<IconPencil />} onClick={run(onRename)}>
            Renommer
          </MenuItem>

          {color && (
            <div className="row-menu__colors" role="group" aria-label="Couleur du bloc-notes">
              <span className="row-menu__colors-label">
                <IconPalette />
                Couleur
              </span>
              <div className="row-menu__swatches">
                {NOTEBOOK_COLORS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option.id === color.value}
                    className={`swatch ${option.id === color.value ? 'is-active' : ''}`}
                    style={{ '--swatch': option.hex } as React.CSSProperties}
                    title={option.label}
                    aria-label={option.label}
                    onClick={run(() => color.onChange(option.id))}
                  />
                ))}
              </div>
            </div>
          )}

          {lock && (
            <div className="row-menu__group">
              {lock.status === 'none' && (
                <MenuItem
                  icon={<IconLock />}
                  onClick={run(lock.onProtect)}
                  disabled={lock.obstacle !== null}
                  // Expliquer le refus vaut mieux que griser sans raison.
                  title={lock.obstacle ?? undefined}
                >
                  Protéger par mot de passe
                </MenuItem>
              )}
              {lock.status === 'closed' && (
                <MenuItem icon={<IconUnlock />} onClick={run(lock.onUnlock)}>
                  Déverrouiller
                </MenuItem>
              )}
              {lock.status === 'open' && (
                <>
                  <MenuItem icon={<IconLock />} onClick={run(lock.onRelock)}>
                    Verrouiller maintenant
                  </MenuItem>
                  <MenuItem icon={<IconUnlock />} onClick={run(lock.onUnprotect)}>
                    Retirer la protection
                  </MenuItem>
                </>
              )}
            </div>
          )}

          <MenuItem icon={<IconTrash />} danger onClick={run(onDelete)}>
            Supprimer
          </MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
  title,
}: {
  icon: ReactNode
  children: ReactNode
  onClick: (event: React.MouseEvent) => void
  danger?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`row-menu__item ${danger ? 'is-danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
      {children}
    </button>
  )
}
