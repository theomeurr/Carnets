import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extension-placeholder'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { newId } from '../lib/id'
import {
  DEFAULT_WIDTH,
  MIN_WIDTH,
  READING_WIDTH,
  extent,
  isBlank,
  readingOrder,
  type Zone,
} from '../lib/zones'

/**
 * La toile d'une page : des cadres de texte posés où l'on veut, comme dans un
 * vrai cahier où l'on écrit dans un coin puis dans un autre.
 *
 * Un clic sur le vide ouvre un cadre à cet endroit. On déplace un cadre par sa
 * poignée, on l'élargit par son bord droit, et un cadre resté vide s'efface
 * dès qu'on le quitte — sans quoi le moindre clic manqué laisserait une trace.
 *
 * **Sur petit écran, les cadres sont empilés** et ne se déplacent plus. Viser
 * et faire glisser des cadres au doigt sur quatre centimètres de large n'est
 * pas une façon d'écrire ; on garde donc le contenu, on abandonne la
 * disposition. Le classement se fait au clavier et à la souris, et se retrouve
 * ensuite sur le téléphone tel qu'il a été rangé.
 */

/** Marge sous le cadre le plus bas, pour qu'il reste de la place où cliquer. */
const SPARE_HEIGHT = 320

export interface CanvasProps {
  zones: Zone[]
  onChange: (zones: Zone[]) => void
  /** L'éditeur du cadre qui a le curseur : c'est lui que la barre d'outils vise. */
  onActive: (editor: Editor | null) => void
  /** Prévient qu'un cadre s'en va, pour ne pas garder son éditeur détruit. */
  onGone: (editor: Editor) => void
  /** Vrai sur téléphone : les cadres sont empilés et figés. */
  stacked: boolean
}

export function Canvas({ zones, onChange, onActive, onGone, stacked }: CanvasProps) {
  const surface = useRef<HTMLDivElement>(null)
  const heights = useRef(new Map<string, number>())
  const [handled, setHandled] = useState<{ id: string; kind: 'move' | 'size' } | null>(null)
  /** Le cadre qui vient de naître : il réclame le curseur, une seule fois. */
  const [born, setBorn] = useState<string | null>(null)

  const zonesRef = useRef(zones)
  zonesRef.current = zones
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  const measure = useCallback((zone: Zone) => heights.current.get(zone.id) ?? 60, [])

  /** Un clic dans le vide ouvre un cadre là où l'on a cliqué. */
  const openAt = useCallback(
    (event: React.MouseEvent) => {
      if (stacked) return
      // Un clic *dans* un cadre appartient à ce cadre.
      if ((event.target as HTMLElement).closest('.zone')) return
      const box = surface.current?.getBoundingClientRect()
      if (!box) return

      const x = Math.max(0, event.clientX - box.left)
      const y = Math.max(0, event.clientY - box.top)
      // Le cadre ne doit pas naître en débordant à droite de la feuille.
      const width = Math.max(MIN_WIDTH, Math.min(DEFAULT_WIDTH, box.width - x))
      const born = { id: newId(), x, y, w: width, html: '' }
      changeRef.current([...zonesRef.current, born])
      // Le curseur va dedans : cliquer puis écrire est le geste entier.
      setBorn(born.id)
    },
    [stacked],
  )

  /*
   * Déplacer ou élargir un cadre. Mêmes événements « pointer » que la
   * réorganisation des listes, et pour la même raison : le glisser natif du
   * HTML ne produit rien au doigt.
   */
  const grab = useCallback(
    (id: string, kind: 'move' | 'size') => (event: ReactPointerEvent) => {
      if (stacked || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      const zone = zonesRef.current.find((candidate) => candidate.id === id)
      const box = surface.current?.getBoundingClientRect()
      if (!zone || !box) return

      const startX = event.clientX
      const startY = event.clientY
      const origin = { x: zone.x, y: zone.y, w: zone.w }
      setHandled({ id, kind })

      const onMove = (move: PointerEvent) => {
        const dx = move.clientX - startX
        const dy = move.clientY - startY
        changeRef.current(
          zonesRef.current.map((candidate) =>
            candidate.id !== id
              ? candidate
              : kind === 'move'
                ? { ...candidate, x: Math.max(0, origin.x + dx), y: Math.max(0, origin.y + dy) }
                : { ...candidate, w: Math.max(MIN_WIDTH, origin.w + dx) },
          ),
        )
      }
      const onUp = () => {
        setHandled(null)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [stacked],
  )

  /** Un cadre quitté sans rien y écrire s'efface. */
  const prune = useCallback((id: string) => {
    const zone = zonesRef.current.find((candidate) => candidate.id === id)
    if (!zone || !isBlank(zone) || zonesRef.current.length < 2) return
    changeRef.current(zonesRef.current.filter((candidate) => candidate.id !== id))
  }, [])

  const size = extent(zones, measure)
  const shown = stacked ? readingOrder(zones) : zones

  return (
    <div
      ref={surface}
      className={`canvas ${stacked ? 'is-stacked' : ''} ${handled ? 'is-handling' : ''}`}
      /*
       * La toile descend sous son contenu, et jamais moins bas que l'écran :
       * sans cela, le vide en bas de page n'appartenait à personne et les
       * clics qui y tombaient ne créaient rien.
       */
      style={
        stacked
          ? undefined
          : ({ '--canvas-min': `${size.height + SPARE_HEIGHT}px` } as React.CSSProperties)
      }
      onMouseDown={openAt}
    >
      {shown.map((zone, index) => (
        <ZoneEditor
          key={zone.id}
          zone={zone}
          stacked={stacked}
          placeholder={index === 0}
          claimFocus={born === zone.id}
          onFocused={() => setBorn(null)}
          onHeight={(height) => heights.current.set(zone.id, height)}
          onHtml={(html) =>
            changeRef.current(
              zonesRef.current.map((candidate) =>
                candidate.id === zone.id ? { ...candidate, html } : candidate,
              ),
            )
          }
          onActive={onActive}
          onGone={onGone}
          onLeave={() => prune(zone.id)}
          onGrab={grab(zone.id, 'move')}
          onResize={grab(zone.id, 'size')}
        />
      ))}
    </div>
  )
}

function ZoneEditor({
  zone,
  stacked,
  placeholder,
  claimFocus,
  onFocused,
  onHeight,
  onHtml,
  onActive,
  onGone,
  onLeave,
  onGrab,
  onResize,
}: {
  zone: Zone
  stacked: boolean
  placeholder: boolean
  claimFocus: boolean
  onFocused: () => void
  onHeight: (height: number) => void
  onHtml: (html: string) => void
  onActive: (editor: Editor | null) => void
  onGone: (editor: Editor) => void
  onLeave: () => void
  onGrab: (event: ReactPointerEvent) => void
  onResize: (event: ReactPointerEvent) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const htmlRef = useRef(onHtml)
  htmlRef.current = onHtml

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
      TaskList,
      TaskItem.configure({ nested: true }),
      ...(placeholder ? [Placeholder.configure({ placeholder: 'Commencez à écrire…' })] : []),
    ],
    content: zone.html,
    editorProps: {
      attributes: { class: 'prose', 'aria-label': 'Contenu du cadre', spellcheck: 'true' },
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
      htmlRef.current(instance.getHTML())
    },
    onFocus({ editor: instance }) {
      onActive(instance)
    },
    onBlur() {
      onLeave()
    },
  })

  // Le cadre s'en va : on le signale pour que la barre d'outils cesse de
  // viser un éditeur détruit.
  const goneRef = useRef(onGone)
  goneRef.current = onGone
  useEffect(() => {
    if (!editor) return
    return () => goneRef.current(editor)
  }, [editor])

  // Un cadre qui vient d'être ouvert prend le curseur, sinon le clic ne
  // servirait à rien : on écrit là où l'on a cliqué.
  useEffect(() => {
    if (!claimFocus || !editor) return
    editor.commands.focus('end')
    onFocused()
  }, [claimFocus, editor, onFocused])

  // La hauteur rendue sert à dimensionner la feuille et à aligner les cadres :
  // elle se mesure, elle ne se devine pas.
  useEffect(() => {
    const element = box.current
    if (!element) return
    const report = () => onHeight(element.getBoundingClientRect().height)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  })

  return (
    <div
      ref={box}
      className="zone"
      data-zone-id={zone.id}
      // Largeur nulle : le cadre prend la largeur de lecture. Il couvrait
      // auparavant la feuille entière, ce qui ne laissait aucun endroit où
      // cliquer pour en ouvrir un second.
      style={stacked ? undefined : { left: zone.x, top: zone.y, width: zone.w || READING_WIDTH }}
    >
      {!stacked && (
        <>
          <button
            type="button"
            className="zone__grab"
            aria-label="Déplacer ce cadre"
            title="Déplacer ce cadre"
            onPointerDown={onGrab}
          >
            <span aria-hidden="true" />
          </button>
          <span
            className="zone__resize"
            role="presentation"
            aria-hidden="true"
            onPointerDown={onResize}
          />
        </>
      )}
      <EditorContent editor={editor} className="zone__content" />
    </div>
  )
}
