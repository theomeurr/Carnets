import { useState } from 'react'
import { displayTitle, formatDate } from '../lib/text'
import { useFolio } from '../store/useFolio'
import { useMobilePane } from './paneContext'
import { KEEP_MS } from '../store/trash'
import type { Notebook, Page, Section, TrashedItem } from '../types'
import { IconNotebook, IconPage, IconTrash } from './Icons'
import { Modal } from './Modal'

/**
 * La corbeille : ce qui a été supprimé et qu'on peut encore remettre.
 *
 * Elle est propre à cet appareil — elle ne part pas au serveur. Restaurer, en
 * revanche, se propage : l'objet revient avec une date plus récente que sa
 * suppression, et la fusion le laisse passer partout.
 */
export function TrashDialog({ onClose }: { onClose: () => void }) {
  const { trash, state } = useFolio()
  const { show } = useMobilePane()
  const [refused, setRefused] = useState<string | null>(null)
  const days = Math.round(KEEP_MS / (24 * 60 * 60 * 1000))

  return (
    <Modal
      title="Corbeille"
      onClose={onClose}
      footer={
        <>
          {trash.items.length > 0 && (
            <button
              type="button"
              className="button is-danger"
              onClick={() => trash.empty()}
              title="Supprime définitivement tout ce que contient la corbeille"
            >
              Vider la corbeille
            </button>
          )}
          <button type="button" className="button is-primary" onClick={onClose}>
            Fermer
          </button>
        </>
      }
    >
      {trash.unavailable ? (
        <p className="dialog-lead">
          Ce navigateur ne permet pas de tenir de corbeille : Folio s’y rabat sur un stockage de
          secours, trop étroit pour garder une copie de ce qu’on supprime. Les suppressions y sont
          donc définitives.
        </p>
      ) : trash.items.length === 0 ? (
        <p className="dialog-lead" style={{ marginBottom: 0 }}>
          Rien de supprimé ces {days} derniers jours. Ce que vous jetez atterrit ici et reste
          récupérable pendant {days} jours, puis s’efface pour de bon.
        </p>
      ) : (
        <>
          <p className="dialog-lead">
            Récupérable pendant {days} jours à compter de la suppression. Cette corbeille est celle
            de cet appareil ; remettre quelque chose le renvoie sur les autres.
          </p>
          <ul className="trash-list">
            {trash.items.map((entry) => (
              <li key={entry.key} className="trash-row">
                <span className="trash-row__icon" aria-hidden="true">
                  {entry.kind === 'page' ? <IconPage /> : <IconNotebook />}
                </span>
                <span className="trash-row__body">
                  <span className="trash-row__name">{nameOf(entry)}</span>
                  <span className="trash-row__meta">
                    {label(entry, state.notebooks, state.sections)} · supprimé{' '}
                    {formatDate(entry.deletedAt)}
                  </span>
                </span>
                <button
                  type="button"
                  className="button trash-row__restore"
                  onClick={() => {
                    if (!trash.restore(entry.key)) {
                      setRefused(entry.key)
                      return
                    }
                    // Sur téléphone, une seule colonne est visible : sans
                    // cela, la note revient sélectionnée mais hors de vue.
                    show(entry.kind === 'page' ? 'editor' : 'pages')
                    onClose()
                  }}
                >
                  Remettre
                </button>
                <button
                  type="button"
                  className="icon-button trash-row__purge"
                  aria-label="Supprimer définitivement"
                  title="Supprimer définitivement"
                  onClick={() => trash.purge(entry.key)}
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
          {refused && (
            <p className="field__error">
              Impossible de remettre cet élément : ce qui le contenait n’existe plus et n’est plus
              en corbeille.
            </p>
          )}
        </>
      )}
    </Modal>
  )
}

function nameOf(entry: TrashedItem): string {
  if (entry.kind === 'page') {
    const page = entry.entity as Page
    // Une page protégée a un titre chiffré, donc vide : on ne prétend pas
    // savoir ce qu'elle contenait.
    return page.cipher ? 'Page protégée' : displayTitle(page.title)
  }
  return (entry.entity as Notebook | Section).name
}

/** D'où cela vient — pour distinguer deux pages qui portent le même titre. */
function label(entry: TrashedItem, notebooks: Notebook[], sections: Section[]): string {
  if (entry.kind === 'notebook') return 'Bloc-notes'
  if (entry.kind === 'section') {
    const notebook = notebooks.find((n) => n.id === (entry.entity as Section).notebookId)
    return notebook ? `Section de ${notebook.name}` : 'Section'
  }
  const section = sections.find((s) => s.id === (entry.entity as Page).sectionId)
  return section ? `Page de ${section.name}` : 'Page'
}
