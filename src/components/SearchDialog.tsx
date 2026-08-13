import { useEffect, useMemo, useRef, useState } from 'react'
import { colorOf } from '../lib/colors'
import { highlight, search, type SearchHit } from '../lib/search'
import { displayTitle, formatDate } from '../lib/text'
import { useFolio } from '../store/useFolio'
import { IconSearch } from './Icons'

/**
 * Recherche globale : elle parcourt les titres et le contenu de toutes les
 * pages, quel que soit le bloc-notes. Choisir un résultat ouvre la page en
 * repositionnant les trois colonnes d'un coup.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { state, select, vault } = useFolio()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Le coffre filtre : une page protégée et fermée n'apparaît jamais dans les
  // résultats, pas même comme entrée masquée.
  const hits = useMemo(
    () => search(state, query, 30, (page) => vault.reveal(page)),
    [state, query, vault],
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setCursor(0)
  }, [query])

  // Garde le résultat mis en avant dans le champ de vision au clavier.
  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const open = (hit: SearchHit) => {
    const section = state.sections.find((s) => s.id === hit.page.sectionId)
    select({
      notebookId: section?.notebookId ?? null,
      sectionId: hit.page.sectionId,
      pageId: hit.page.id,
    })
    onClose()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((value) => Math.min(value + 1, hits.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((value) => Math.max(value - 1, 0))
    } else if (event.key === 'Enter' && hits[cursor]) {
      event.preventDefault()
      open(hits[cursor])
    }
  }

  return (
    <div className="search-backdrop" onMouseDown={onClose}>
      <div
        className="search"
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher dans toutes les pages"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="search__field">
          <IconSearch className="search__icon" />
          <input
            ref={inputRef}
            className="search__input"
            type="search"
            placeholder="Rechercher dans toutes les pages…"
            aria-label="Rechercher"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="search__kbd">Échap</kbd>
        </div>

        <div className="search__results">
          {query.trim() === '' ? (
            <p className="search__hint">
              Tapez pour chercher dans les titres et le contenu de vos {state.pages.length} pages.
              {state.locks.length > 0 && ' Les pages verrouillées en sont exclues.'}
            </p>
          ) : hits.length === 0 ? (
            <p className="search__hint">Aucun résultat pour « {query.trim()} ».</p>
          ) : (
            <ul className="search__list" ref={listRef} role="listbox" aria-label="Résultats">
              {hits.map((hit, index) => (
                <li key={hit.page.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === cursor}
                    className={`search__hit ${index === cursor ? 'is-active' : ''}`}
                    onMouseMove={() => setCursor(index)}
                    onClick={() => open(hit)}
                  >
                    <span className="search__hit-head">
                      <span
                        className="search__hit-dot"
                        style={{ background: colorOf(hit.notebookColor).hex }}
                        aria-hidden="true"
                      />
                      <span className="search__hit-title">
                        <Marked value={displayTitle(hit.title)} query={query} />
                      </span>
                      <span className="search__hit-date">{formatDate(hit.page.updatedAt)}</span>
                    </span>
                    <span className="search__hit-path">
                      {hit.notebookName} › {hit.sectionName}
                    </span>
                    {hit.snippet && (
                      <span className="search__hit-snippet">
                        <Marked value={hit.snippet} query={query} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** Surligne les termes trouvés sans jamais réinjecter de HTML. */
function Marked({ value, query }: { value: string; query: string }) {
  return (
    <>
      {highlight(value, query).map((part, index) =>
        part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
      )}
    </>
  )
}
