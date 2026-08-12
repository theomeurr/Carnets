import { useState } from 'react'
import { colorOf } from '../lib/colors'
import { displayTitle, formatDate } from '../lib/text'
import { useCarnets, useCurrentView } from '../store/useCarnets'
import type { Id } from '../types'
import { IconPlus } from './Icons'
import { InlineRename } from './InlineRename'
import { ConfirmDialog } from './Modal'
import { RowMenu } from './RowMenu'

/** Colonne du milieu : les pages de la section ouverte. */
export function PageList() {
  const carnets = useCarnets()
  const { select, addPage } = carnets
  const { notebook, section, page: activePage, pages } = useCurrentView()

  const [renaming, setRenaming] = useState<Id | null>(null)
  const [pending, setPending] = useState<{ id: Id; title: string } | null>(null)

  const accent = colorOf(notebook?.color).hex

  return (
    <section
      className="pages"
      aria-label="Pages de la section"
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <div className="column-head">
        <h2 className="column-head__title" title={section?.name}>
          {section?.name ?? 'Pages'}
        </h2>
        {section && (
          <button
            type="button"
            className="icon-button"
            title="Nouvelle page"
            aria-label="Nouvelle page"
            onClick={() => addPage(section.id)}
          >
            <IconPlus />
          </button>
        )}
      </div>

      <div className="pages__scroll">
        {!section ? (
          <p className="empty-hint">
            Créez une section dans la colonne de gauche pour commencer à écrire.
          </p>
        ) : pages.length === 0 ? (
          <div className="empty-block">
            <p className="empty-hint">Cette section est vide.</p>
            <button type="button" className="ghost-button" onClick={() => addPage(section.id)}>
              <IconPlus />
              Nouvelle page
            </button>
          </div>
        ) : (
          <ul className="page-list">
            {pages.map((page) => (
              <li key={page.id}>
                <div
                  className={`page-card ${page.id === activePage?.id ? 'is-active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-current={page.id === activePage?.id ? 'true' : undefined}
                  onClick={() => select({ pageId: page.id })}
                  onDoubleClick={() => setRenaming(page.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select({ pageId: page.id })
                    }
                  }}
                >
                  <div className="page-card__head">
                    {renaming === page.id ? (
                      <InlineRename
                        ariaLabel={`Renommer la page ${displayTitle(page.title)}`}
                        value={page.title}
                        onCommit={(title) => {
                          carnets.renamePage(page.id, title)
                          setRenaming(null)
                        }}
                        onCancel={() => setRenaming(null)}
                      />
                    ) : (
                      <span
                        className={`page-card__title ${page.title.trim() ? '' : 'is-untitled'}`}
                      >
                        {displayTitle(page.title)}
                      </span>
                    )}
                    <RowMenu
                      label={`la page ${displayTitle(page.title)}`}
                      onRename={() => setRenaming(page.id)}
                      onDelete={() => setPending({ id: page.id, title: displayTitle(page.title) })}
                    />
                  </div>
                  <p className="page-card__preview">
                    {page.text.trim() ? page.text.slice(0, 120) : 'Page vide'}
                  </p>
                  <p className="page-card__date">{formatDate(page.updatedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          title="Supprimer la page ?"
          message={
            <p>
              <strong>{pending.title}</strong> sera supprimée définitivement.
            </p>
          }
          onConfirm={() => {
            carnets.removePage(pending.id)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  )
}
