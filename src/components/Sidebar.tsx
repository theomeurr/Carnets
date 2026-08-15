import { useState } from 'react'
import { colorOf } from '../lib/colors'
import { useFolio, useCurrentView, usePageCounts } from '../store/useFolio'
import type { Id } from '../types'
import { IconLock, IconNotebook, IconPlus, IconTrash } from './Icons'
import { useMobilePane } from './paneContext'
import { InlineRename } from './InlineRename'
import { ConfirmDialog } from './Modal'
import { RowMenu } from './RowMenu'
import { TrashDialog } from './TrashDialog'
import { useLockMenu } from './useLockMenu'
import { useReorder } from './useReorder'

type Pending =
  | { kind: 'notebook'; id: Id; name: string; sections: number; pages: number }
  | { kind: 'section'; id: Id; name: string; pages: number }

/**
 * Colonne de gauche : la liste des bloc-notes, chacun avec son onglet coloré,
 * et les sections du bloc-notes ouvert dépliées juste en dessous.
 */
export function Sidebar() {
  const folio = useFolio()
  const { state, select, addNotebook, addSection, trash, reorder } = folio
  const { notebook: activeNotebook, section: activeSection, sections } = useCurrentView()
  const pageCounts = usePageCounts()

  const { controlsFor, dialogs } = useLockMenu()
  const { show } = useMobilePane()

  const [renaming, setRenaming] = useState<Id | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)

  const dragNotebooks = useReorder(
    state.notebooks.map((n) => n.id),
    (id, to) => reorder('notebook', id, to),
  )
  const dragSections = useReorder(
    sections.map((s) => s.id),
    (id, to) => reorder('section', id, to),
  )

  const askDeleteNotebook = (id: Id, name: string) => {
    const owned = state.sections.filter((s) => s.notebookId === id)
    const ownedIds = new Set(owned.map((s) => s.id))
    setPending({
      kind: 'notebook',
      id,
      name,
      sections: owned.length,
      pages: state.pages.filter((p) => ownedIds.has(p.sectionId)).length,
    })
  }

  const confirmDelete = () => {
    if (!pending) return
    if (pending.kind === 'notebook') folio.removeNotebook(pending.id)
    else folio.removeSection(pending.id)
    setPending(null)
  }

  return (
    <aside className="sidebar" aria-label="Bloc-notes et sections">
      <div className="column-head">
        <h2 className="column-head__title">Bloc-notes</h2>
        <button
          type="button"
          className="icon-button"
          title="Nouveau bloc-notes"
          aria-label="Nouveau bloc-notes"
          onClick={() => setRenaming(addNotebook().id)}
        >
          <IconPlus />
        </button>
      </div>

      <div className="sidebar__scroll">
        {state.notebooks.length === 0 && (
          <p className="empty-hint">Aucun bloc-notes pour l’instant.</p>
        )}

        <ul className="notebook-list">
          {state.notebooks.map((notebook) => {
            const color = colorOf(notebook.color)
            const isActive = notebook.id === activeNotebook?.id
            return (
              <li key={notebook.id} className="notebook-list__item">
                <div
                  {...dragNotebooks.itemProps(notebook.id)}
                  className={`notebook-row ${isActive ? 'is-active' : ''} ${
                    dragNotebooks.dragging === notebook.id ? 'is-dragging' : ''
                  } ${
                    dragNotebooks.dropSide(notebook.id)
                      ? `is-drop-${dragNotebooks.dropSide(notebook.id)}`
                      : ''
                  }`}
                  style={{ '--accent': color.hex } as React.CSSProperties}
                  onClick={() => {
                    // Un dépôt finit par un clic sur la ligne : on ne veut pas
                    // qu'il change aussi de bloc-notes.
                    if (dragNotebooks.dragging) return
                    select({ notebookId: notebook.id })
                  }}
                  onDoubleClick={() => setRenaming(notebook.id)}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive ? 'true' : undefined}
                  onKeyDown={(event) => {
                    dragNotebooks.itemProps(notebook.id).onKeyDown(event)
                    if (event.defaultPrevented) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select({ notebookId: notebook.id })
                    }
                  }}
                >
                  <span className="notebook-row__tab" aria-hidden="true" />
                  {controlsFor('notebook', notebook.id, notebook.name).status === 'closed' ? (
                    <IconLock className="notebook-row__icon is-locked" />
                  ) : (
                    <IconNotebook className="notebook-row__icon" />
                  )}
                  {renaming === notebook.id ? (
                    <InlineRename
                      ariaLabel={`Renommer le bloc-notes ${notebook.name}`}
                      value={notebook.name}
                      onCommit={(name) => {
                        folio.renameNotebook(notebook.id, name)
                        setRenaming(null)
                      }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <span className="notebook-row__name">{notebook.name}</span>
                  )}
                  <RowMenu
                    label={`le bloc-notes ${notebook.name}`}
                    onRename={() => setRenaming(notebook.id)}
                    onDelete={() => askDeleteNotebook(notebook.id, notebook.name)}
                    color={{
                      value: notebook.color,
                      onChange: (next) => folio.recolorNotebook(notebook.id, next),
                    }}
                    lock={controlsFor('notebook', notebook.id, notebook.name)}
                  />
                </div>

                {isActive && (
                  <div className="section-block" style={{ '--accent': color.hex } as React.CSSProperties}>
                    <ul className="section-list">
                      {sections.map((section) => (
                        <li key={section.id}>
                          <div
                            {...dragSections.itemProps(section.id)}
                            /* Cible d'accueil pour une page venue de la
                               colonne du milieu ; voir `useReorder`. */
                            data-drop-section={section.id}
                            className={`section-row ${
                              section.id === activeSection?.id ? 'is-active' : ''
                            } ${dragSections.dragging === section.id ? 'is-dragging' : ''} ${
                              dragSections.dropSide(section.id)
                                ? `is-drop-${dragSections.dropSide(section.id)}`
                                : ''
                            }`}
                            role="button"
                            tabIndex={0}
                            aria-current={section.id === activeSection?.id ? 'true' : undefined}
                            onClick={() => {
                              if (dragSections.dragging) return
                              select({ sectionId: section.id })
                              show('pages')
                            }}
                            onDoubleClick={() => setRenaming(section.id)}
                            onKeyDown={(event) => {
                              dragSections.itemProps(section.id).onKeyDown(event)
                              if (event.defaultPrevented) return
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                select({ sectionId: section.id })
                                show('pages')
                              }
                            }}
                          >
                            {controlsFor('section', section.id, section.name).status ===
                            'closed' ? (
                              <IconLock className="section-row__lock" />
                            ) : (
                              <span className="section-row__dot" aria-hidden="true" />
                            )}
                            {renaming === section.id ? (
                              <InlineRename
                                ariaLabel={`Renommer la section ${section.name}`}
                                value={section.name}
                                onCommit={(name) => {
                                  folio.renameSection(section.id, name)
                                  setRenaming(null)
                                }}
                                onCancel={() => setRenaming(null)}
                              />
                            ) : (
                              <span className="section-row__name">{section.name}</span>
                            )}
                            <span className="section-row__count" aria-hidden="true">
                              {pageCounts.get(section.id) ?? 0}
                            </span>
                            <RowMenu
                              label={`la section ${section.name}`}
                              onRename={() => setRenaming(section.id)}
                              onDelete={() =>
                                setPending({
                                  kind: 'section',
                                  id: section.id,
                                  name: section.name,
                                  pages: pageCounts.get(section.id) ?? 0,
                                })
                              }
                              lock={controlsFor('section', section.id, section.name)}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        setRenaming(addSection(notebook.id).id)
                        show('pages')
                      }}
                    >
                      <IconPlus />
                      Nouvelle section
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="sidebar__foot">
        <button type="button" className="sidebar__add" onClick={() => setRenaming(addNotebook().id)}>
          <IconPlus />
          Nouveau bloc-notes
        </button>
        <button
          type="button"
          className="sidebar__trash"
          aria-label="Corbeille"
          title="Ce qui a été supprimé, encore récupérable"
          onClick={() => setTrashOpen(true)}
        >
          <IconTrash />
          {trash.items.length > 0 && (
            <span className="sidebar__trash-count">{trash.items.length}</span>
          )}
        </button>
      </div>

      {trashOpen && <TrashDialog onClose={() => setTrashOpen(false)} />}

      {dialogs}

      {pending && (
        <ConfirmDialog
          title={pending.kind === 'notebook' ? 'Supprimer le bloc-notes ?' : 'Supprimer la section ?'}
          message={
            pending.kind === 'notebook' ? (
              <p>
                <strong>{pending.name}</strong> sera supprimé, avec{' '}
                {countLabel(pending.sections, 'section', 'sections')} et{' '}
                {countLabel(pending.pages, 'page', 'pages')}. Le tout part à la corbeille, où il
                reste récupérable pendant 30 jours.
              </p>
            ) : (
              <p>
                <strong>{pending.name}</strong> sera supprimée, avec{' '}
                {countLabel(pending.pages, 'page', 'pages')}. Le tout part à la corbeille, où il
                reste récupérable pendant 30 jours.
              </p>
            )
          }
          onConfirm={confirmDelete}
          onCancel={() => setPending(null)}
        />
      )}
    </aside>
  )
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`
}
