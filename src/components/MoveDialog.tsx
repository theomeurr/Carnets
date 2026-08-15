import { useState } from 'react'
import { colorOf } from '../lib/colors'
import { useFolio } from '../store/useFolio'
import type { Id } from '../types'
import { Modal } from './Modal'

/**
 * Choisir la section d'accueil d'une page, sans glisser.
 *
 * Sur téléphone une seule colonne est visible à la fois : les pages et les
 * sections ne sont jamais à l'écran ensemble, et le glisser-déposer y est donc
 * impossible. Ce chemin existe pour cela — et il sert aussi au clavier, et
 * quand la section visée est loin dans une longue liste.
 */
export function MoveDialog({
  pageId,
  currentSectionId,
  onClose,
}: {
  pageId: Id
  currentSectionId: Id
  onClose: () => void
}) {
  const { state, movePage } = useFolio()
  const [refused, setRefused] = useState<string | null>(null)

  return (
    <Modal
      title="Déplacer la page"
      onClose={onClose}
      footer={
        <button type="button" className="button" onClick={onClose}>
          Annuler
        </button>
      }
    >
      <p className="dialog-lead">Choisissez la section qui l’accueillera.</p>

      <ul className="move-list">
        {state.notebooks.map((notebook) => {
          const sections = state.sections.filter((s) => s.notebookId === notebook.id)
          if (sections.length === 0) return null
          return (
            <li key={notebook.id}>
              <p className="move-list__notebook">
                <span
                  className="move-list__dot"
                  style={{ background: colorOf(notebook.color).hex }}
                  aria-hidden="true"
                />
                {notebook.name}
              </p>
              <ul className="move-list__sections">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      className="move-list__choice"
                      disabled={section.id === currentSectionId}
                      onClick={() => {
                        const reason = movePage(pageId, section.id)
                        if (reason) setRefused(reason)
                        else onClose()
                      }}
                    >
                      {section.name}
                      {section.id === currentSectionId && (
                        <span className="move-list__here">elle y est déjà</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>

      {refused && <p className="field__error">{refused}</p>}
    </Modal>
  )
}
