import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { colorOf } from '../lib/colors'
import { lockOfPage } from '../lib/locks'
import { formatDate, htmlToText } from '../lib/text'
import { alignZones, parseZones, serializeZones, type Zone } from '../lib/zones'
import type { PageContent } from '../store/useVault'
import { useFolio, useCurrentView } from '../store/useFolio'
import type { Page } from '../types'
import { Canvas } from './Canvas'
import { EditorToolbar } from './EditorToolbar'
import { IconPage, IconPlus } from './Icons'
import { SealedPanel } from './SealedPanel'

/** Attente d'inactivité avant de renvoyer le contenu au magasin. */
const WRITE_DELAY_MS = 150

/**
 * Colonne de droite. La surface d'édition est montée avec la page pour clé :
 * changer de page reconstruit l'éditeur, ce qui garantit un contenu propre et
 * un historique d'annulation qui ne déborde pas d'une page sur l'autre.
 */
export function PageEditor() {
  const { notebook, section, page } = useCurrentView()
  const { addPage, state, vault } = useFolio()
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
  const { renamePage, writePage, claimNewPageFocus } = useFolio()
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  /*
   * Cette surface est montée avec la page pour clé : l'instance appartient
   * donc à une seule page, et un vidage tardif — y compris celui du démontage
   * quand on change de note — écrit forcément sur la bonne.
   */
  const pageRef = useRef(page.id)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writeRef = useRef(writePage)
  writeRef.current = writePage

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty.current) return
    dirty.current = false
    const html = serializeZones(zonesRef.current)
    writeRef.current(pageRef.current, html, htmlToText(html))
  }, [])

  /*
   * Les cadres de la page. Ils sont relus une fois, à l'ouverture : ensuite
   * c'est cet état qui fait foi, et `content.html` n'est plus consulté — le
   * relire à chaque frappe écraserait ce qu'on est en train d'écrire.
   */
  const [zones, setZones] = useState<Zone[]>(() => parseZones(content.html))
  const [active, setActive] = useState<Editor | null>(null)
  const zonesRef = useRef(zones)
  zonesRef.current = zones

  const heights = useRef(new Map<string, number>())

  /*
   * La mise en HTML n'a pas lieu à chaque frappe : elle attend la pause, avec
   * l'écriture. Sérialiser puis relire tout le document pour en extraire le
   * texte, lettre après lettre, se paierait sur les longues pages.
   */
  const write = useCallback(
    (next: Zone[]) => {
      setZones(next)
      zonesRef.current = next
      dirty.current = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, WRITE_DELAY_MS)
    },
    [flush],
  )

  /*
   * « Tout aligner » : les cadres sont empilés dans l'ordre de lecture, calés
   * à gauche et à la même largeur. Les hauteurs viennent du rendu, mesurées
   * ici — les deviner décalerait la pile.
   */
  const align = useCallback(() => {
    const surface = sheetRef.current?.querySelector('.canvas')
    const width = surface ? surface.getBoundingClientRect().width : 0
    write(
      alignZones(zonesRef.current, Math.max(240, width), (zone) => {
        const element = surface?.querySelector(`[data-zone-id="${zone.id}"]`)
        return element ? element.getBoundingClientRect().height : (heights.current.get(zone.id) ?? 60)
      }),
    )
  }, [write])

  // Quitter la page (changement de sélection ou fermeture) écrit ce qui reste.
  useEffect(() => flush, [flush])

  /*
   * Sur petit écran les cadres sont empilés et figés : viser et faire glisser
   * des cadres au doigt sur quatre centimètres de large n'est pas une façon
   * d'écrire. Le contenu reste, la disposition est mise de côté.
   */
  const stacked = useNarrow()

  // Une page que l'on vient de créer reçoit le curseur dans son titre. Le droit
  // ne se réclame qu'une fois : ouvrir une page vide déjà existante, ou créer
  // une section, ne vole pas le focus à ce que l'utilisateur est en train de
  // faire ailleurs.
  useEffect(() => {
    if (claimNewPageFocus(page.id)) titleRef.current?.focus()
  }, [claimNewPageFocus, page.id])

  // Le titre est un `textarea` qui grandit avec son contenu, pour ne jamais
  // tronquer une longue formulation. On le remesure au fil de la frappe, mais
  // aussi dès que l'élément change de taille : sur téléphone il est monté
  // dans un panneau masqué, où toute mesure vaut zéro, et il serait resté
  // haut de zéro pixel en devenant visible.
  useEffect(() => {
    const element = titleRef.current
    if (!element) return
    const fit = () => {
      element.style.height = 'auto'
      element.style.height = `${element.scrollHeight}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [content.title])

  return (
    <section className="editor" aria-label="Éditeur" style={{ '--accent': accent } as React.CSSProperties}>
      <EditorToolbar editor={active} onAlign={zones.length > 1 && !stacked ? align : undefined} />

      <div className="editor__scroll">
        <div className="editor__sheet" ref={sheetRef}>
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
                active?.commands.focus('start')
              }
            }}
          />
          <p className="editor__meta">
            Modifié {formatDate(page.updatedAt)} · {countWords(content.text)}
          </p>
          <Canvas
            zones={zones}
            onChange={write}
            onActive={setActive}
            stacked={stacked}
          />
        </div>
      </div>
    </section>
  )
}

function countWords(text: string): string {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return words === 0 ? 'page vide' : `${words} mot${words > 1 ? 's' : ''}`
}

/**
 * Vrai sur les écrans où la toile ne tient pas. Le seuil est celui du reste de
 * l'application, où une seule colonne est visible à la fois.
 */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(max-width: 820px)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(max-width: 820px)')
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}
