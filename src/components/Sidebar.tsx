import { useState } from 'react'
import { colorOf } from '../lib/colors'
import { useCarnets, useCurrentView, usePageCounts } from '../store/useCarnets'
import type { Id } from '../types'
import { IconNotebook, IconPlus } from './Icons'
import { InlineRename } from './InlineRename'
import { ConfirmDialog } from './Modal'
import { RowMenu } from './RowMenu'

type Pending =
  | { kind: 'notebook'; id: Id; name: string; sections: number; pages: number }
  | { kind: 'section'; id: Id; name: string; pages: number }

/**
 * Colonne de gauche : la liste des bloc-notes, chacun avec son onglet coloré,
 * et les sections du bloc-notes ouvert dépliées juste en dessous.
 */
export function Sidebar() {
  const carnets = useCarnets()
  const { state, select, addNotebook, addSection } = carnets
  const { notebook: activeNotebook, section: activeSection, sections } = useCurrentView()
  const pageCounts = usePageCounts()

  const [renaming, setRenaming] = useState<Id | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

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
    if (pending.kind === 'notebook') carnets.removeNotebook(pending.id)
    else carnets.removeSection(pending.id)
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
                  className={`notebook-row ${isActive ? 'is-active' : ''}`}
                  style={{ '--accent': color.hex } as React.CSSProperties}
                  onClick={() => select({ notebookId: notebook.id })}
                  onDoubleClick={() => setRenaming(notebook.id)}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive ? 'true' : undefined}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select({ notebookId: notebook.id })
                    }
                  }}
                >
                  <span className="notebook-row__tab" aria-hidden="true" />
                  <IconNotebook className="notebook-row__icon" />
                  {renaming === notebook.id ? (
                    <InlineRename
                      ariaLabel={`Renommer le bloc-notes ${notebook.name}`}
                      value={notebook.name}
                      onCommit={(name) => {
                        carnets.renameNotebook(notebook.id, name)
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
                      onChange: (next) => carnets.recolorNotebook(notebook.id, next),
                    }}
                  />
                </div>

                {isActive && (
                  <div className="section-block" style={{ '--accent': color.hex } as React.CSSProperties}>
                    <ul className="section-list">
                      {sections.map((section) => (
                        <li key={section.id}>
                          <div
                            className={`section-row ${
                              section.id === activeSection?.id ? 'is-active' : ''
                            }`}
                            role="button"
                            tabIndex={0}
                            aria-current={section.id === activeSection?.id ? 'true' : undefined}
                            onClick={() => select({ sectionId: section.id })}
                            onDoubleClick={() => setRenaming(section.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                select({ sectionId: section.id })
                              }
                            }}
                          >
                            <span className="section-row__dot" aria-hidden="true" />
                            {renaming === section.id ? (
                              <InlineRename
                                ariaLabel={`Renommer la section ${section.name}`}
                                value={section.name}
                                onCommit={(name) => {
                                  carnets.renameSection(section.id, name)
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
                            />
                          </div>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setRenaming(addSection(notebook.id).id)}
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

      <button type="button" className="sidebar__add" onClick={() => setRenaming(addNotebook().id)}>
        <IconPlus />
        Nouveau bloc-notes
      </button>

      {pending && (
        <ConfirmDialog
          title={pending.kind === 'notebook' ? 'Supprimer le bloc-notes ?' : 'Supprimer la section ?'}
          message={
            pending.kind === 'notebook' ? (
              <p>
                <strong>{pending.name}</strong> sera supprimé, avec{' '}
                {countLabel(pending.sections, 'section', 'sections')} et{' '}
                {countLabel(pending.pages, 'page', 'pages')}. Cette action est définitive.
              </p>
            ) : (
              <p>
                <strong>{pending.name}</strong> sera supprimée, avec{' '}
                {countLabel(pending.pages, 'page', 'pages')}. Cette action est définitive.
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
