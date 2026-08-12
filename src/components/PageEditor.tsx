import { Placeholder } from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useRef } from 'react'
import { colorOf } from '../lib/colors'
import { lockOfPage } from '../lib/locks'
import { formatDate } from '../lib/text'
import type { PageContent } from '../store/useVault'
import { useCarnets, useCurrentView } from '../store/useCarnets'
import type { Page } from '../types'
import { EditorToolbar } from './EditorToolbar'
import { IconPage, IconPlus } from './Icons'
import { SealedPanel } from './SealedPanel'

/** Attente d'inactivité avant de renvoyer le contenu au magasin. */
const WRITE_DELAY_MS = 300

/**
 * Colonne de droite. La surface d'édition est montée avec la page pour clé :
 * changer de page reconstruit l'éditeur, ce qui garantit un contenu propre et
 * un historique d'annulation qui ne déborde pas d'une page sur l'autre.
 */
export function PageEditor() {
  const { notebook, section, page } = useCurrentView()
  const { addPage, state, vault } = useCarnets()
  const content = page ? vault.reveal(page) : null

  if (!page) {
    return (
      <section className="editor editor--empty" aria-label="Éditeur">
        <div className="editor__placeholder">
          <IconPage className="editor__placeholder-icon" />
          <p>{section ? 'Aucune page ouverte.' : 'Aucune section sélectionnée.'}</p>
          {section && (
            <button type="button" className="button is-primary" onClick={() => addPage(section.id)}>
              <IconPlus />
              Nouvelle page
            </button>
          )}
        </div>
      </section>
    )
  }

  const accent = colorOf(notebook?.color).hex
  const breadcrumb = [notebook?.name, section?.name].filter(Boolean).join(' › ')

  // Protégée et fermée : on montre le formulaire de déverrouillage à la place
  // de l'éditeur. Il n'y a de toute façon rien à afficher — le contenu est
  // chiffré, et la clé n'existe pas dans cette session.
  const lock = lockOfPage(state, page)
  if (!content && lock) {
    return <SealedPanel lock={lock} accent={accent} breadcrumb={breadcrumb} />
  }

  return (
    <PageSurface
      key={page.id}
      page={page}
      content={content ?? { title: page.title, html: page.html, text: page.text }}
      accent={accent}
      breadcrumb={breadcrumb}
    />
  )
}

function PageSurface({
  page,
  content,
  accent,
  breadcrumb,
}: {
  page: Page
  /** Le contenu lisible : celui de la page, ou celui déchiffré pour la session. */
  content: PageContent
  accent: string
  breadcrumb: string
}) {
  const { renamePage, writePage, claimNewPageFocus } = useCarnets()
  const titleRef = useRef<HTMLTextAreaElement>(null)

  // Frappe en attente d'écriture : conservée avec son identifiant de page pour
  // que le vidage tardif atterrisse toujours sur la bonne note.
  const draft = useRef<{ id: string; html: string; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writeRef = useRef(writePage)
  writeRef.current = writePage

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const pendingDraft = draft.current
    if (!pendingDraft) return
    draft.current = null
    writeRef.current(pendingDraft.id, pendingDraft.html, pendingDraft.text)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder: 'Commencez à écrire…' }),
    ],
    content: content.html,
    editorProps: {
      attributes: {
        class: 'prose',
        'aria-label': 'Contenu de la page',
        spellcheck: 'true',
      },
      // Ctrl/⌘ + clic suit un lien ; un clic simple place le curseur pour
      // pouvoir corriger le texte du lien.
      handleClick(_view, _pos, event) {
        if (!event.ctrlKey && !event.metaKey) return false
        const anchor = (event.target as HTMLElement | null)?.closest('a')
        const href = anchor?.getAttribute('href')
        if (!href || !/^https?:/i.test(href)) return false
        window.open(href, '_blank', 'noopener,noreferrer')
        return true
      },
    },
    onUpdate({ editor: instance }) {
      draft.current = {
        id: page.id,
        html: instance.getHTML(),
        text: instance.getText({ blockSeparator: ' ' }),
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, WRITE_DELAY_MS)
    },
  })

  // Quitter la page (changement de sélection ou fermeture) écrit ce qui reste.
  useEffect(() => flush, [flush])

  // Une page que l'on vient de créer reçoit le curseur dans son titre. Le droit
  // ne se réclame qu'une fois : ouvrir une page vide déjà existante, ou créer
  // une section, ne vole pas le focus à ce que l'utilisateur est en train de
  // faire ailleurs.
  useEffect(() => {
    if (claimNewPageFocus(page.id)) titleRef.current?.focus()
  }, [claimNewPageFocus, page.id])

  // Le titre est un `textarea` qui grandit avec son contenu, pour ne jamais
  // tronquer une longue formulation.
  useEffect(() => {
    const element = titleRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [content.title])

  return (
    <section className="editor" aria-label="Éditeur" style={{ '--accent': accent } as React.CSSProperties}>
      {editor && <EditorToolbar editor={editor} />}

      <div className="editor__scroll">
        <div className="editor__sheet">
          <p className="editor__breadcrumb">{breadcrumb}</p>
          <textarea
            ref={titleRef}
            className="editor__title"
            rows={1}
            placeholder="Page sans titre"
            aria-label="Titre de la page"
            value={content.title}
            onChange={(event) => renamePage(page.id, event.target.value.replace(/\n/g, ''))}
            onKeyDown={(event) => {
              // Entrée depuis le titre descend dans le corps de la page.
              if (event.key === 'Enter' || event.key === 'ArrowDown') {
                event.preventDefault()
                editor?.commands.focus('start')
              }
            }}
          />
          <p className="editor__meta">
            Modifié {formatDate(page.updatedAt)} · {countWords(content.text)}
          </p>
          <EditorContent editor={editor} className="editor__content" />
        </div>
      </div>
    </section>
  )
}

function countWords(text: string): string {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return words === 0 ? 'page vide' : `${words} mot${words > 1 ? 's' : ''}`
}
