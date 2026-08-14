import { useState } from 'react'
import { colorOf } from '../lib/colors'
import { displayTitle, formatDate } from '../lib/text'
import { useFolio, useCurrentView } from '../store/useFolio'
import type { Id } from '../types'
import { IconLock, IconPlus } from './Icons'
import { useMobilePane } from './paneContext'
import { InlineRename } from './InlineRename'
import { ConfirmDialog } from './Modal'
import { PrintSheet, type Printable } from './PrintSheet'
import { RowMenu } from './RowMenu'
import { useLockMenu } from './useLockMenu'
import { useReorder } from './useReorder'

/** Colonne du milieu : les pages de la section ouverte. */
export function PageList() {
  const folio = useFolio()
  const { select, addPage, vault, reorder } = folio
  const { controlsFor, dialogs } = useLockMenu()
  const { show } = useMobilePane()
  const { notebook, section, page: activePage, pages } = useCurrentView()

  const [renaming, setRenaming] = useState<Id | null>(null)
  const [pending, setPending] = useState<{ id: Id; title: string } | null>(null)
  const [printing, setPrinting] = useState<Printable | null>(null)

  const drag = useReorder(
    pages.map((page) => page.id),
    (id, to) => reorder('page', id, to),
  )

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
            onClick={() => {
              addPage(section.id)
              show('editor')
            }}
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
            <button type="button" className="ghost-button" onClick={() => {
              addPage(section.id)
              show('editor')
            }}>
              <IconPlus />
              Nouvelle page
            </button>
          </div>
        ) : (
          <ul className="page-list">
            {pages.map((page) => {
              // `null` = protégée et fermée : ni titre, ni aperçu à montrer.
              const content = vault.reveal(page)
              const title = displayTitle(content?.title ?? '')
              return (
              <li key={page.id}>
                <div
                  {...drag.itemProps(page.id)}
                  className={`page-card ${page.id === activePage?.id ? 'is-active' : ''} ${
                    content ? '' : 'is-sealed'
                  } ${drag.dragging === page.id ? 'is-dragging' : ''} ${
                    drag.dropSide(page.id) ? `is-drop-${drag.dropSide(page.id)}` : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-current={page.id === activePage?.id ? 'true' : undefined}
                  onClick={() => {
                    // Un dépôt se termine par un `pointerup` sur la ligne, donc
                    // par un clic : sans cette réserve, déplacer changerait
                    // aussi de page.
                    if (drag.dragging) return
                    select({ pageId: page.id })
                    show('editor')
                  }}
                  onDoubleClick={() => setRenaming(page.id)}
                  onKeyDown={(event) => {
                    drag.itemProps(page.id).onKeyDown(event)
                    if (event.defaultPrevented) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select({ pageId: page.id })
                      show('editor')
                    }
                  }}
                >
                  <div className="page-card__head">
                    {!content && <IconLock className="page-card__lock" />}
                    {renaming === page.id && content ? (
                      <InlineRename
                        ariaLabel={`Renommer la page ${title}`}
                        value={content.title}
                        onCommit={(next) => {
                          folio.renamePage(page.id, next)
                          setRenaming(null)
                        }}
                        onCancel={() => setRenaming(null)}
                      />
                    ) : (
                      <span
                        className={`page-card__title ${
                          content?.title.trim() ? '' : 'is-untitled'
                        }`}
                      >
                        {content ? title : 'Page verrouillée'}
                      </span>
                    )}
                    <RowMenu
                      label={content ? `la page ${title}` : 'la page verrouillée'}
                      onRename={() => setRenaming(page.id)}
                      onDelete={() =>
                        setPending({ id: page.id, title: content ? title : 'Page verrouillée' })
                      }
                      lock={controlsFor('page', page.id, content ? title : 'Page verrouillée')}
                      // Une page fermée n'a rien de lisible à imprimer : son
                      // contenu est chiffré et la clé n'existe pas ici.
                      onPrint={
                        content
                          ? () =>
                              setPrinting({
                                title,
                                breadcrumb: [notebook?.name, section?.name]
                                  .filter(Boolean)
                                  .join(' › '),
                                html: content.html,
                                updatedAt: page.updatedAt,
                              })
                          : undefined
                      }
                    />
                  </div>
                  <p className="page-card__preview">
                    {!content
                      ? 'Contenu chiffré — déverrouillez pour lire.'
                      : content.text.trim()
                        ? content.text.slice(0, 120)
                        : 'Page vide'}
                  </p>
                  <p className="page-card__date">{formatDate(page.updatedAt)}</p>
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </div>

      {dialogs}

      {pending && (
        <ConfirmDialog
          title="Supprimer la page ?"
          message={
            <p>
              <strong>{pending.title}</strong> part à la corbeille, où elle reste récupérable
              pendant 30 jours.
            </p>
          }
          onConfirm={() => {
            folio.removePage(pending.id)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}

      {printing && <PrintSheet page={printing} onDone={() => setPrinting(null)} />}
    </section>
  )
}
