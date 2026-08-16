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
  MIN_WIDTH,
  READING_WIDTH,
  extent,
  isBlank,
  placeAt,
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
  /** Les éditeurs vivants, pour pouvoir rendre le curseur à l'un d'eux. */
  const editors = useRef(new Map<string, Editor>())
  const [handled, setHandled] = useState<{ id: string; kind: 'move' | 'size' } | null>(null)
  /** Le cadre qui vient de naître : il réclame le curseur, une seule fois. */
  const [born, setBorn] = useState<string | null>(null)

  const zonesRef = useRef(zones)
  zonesRef.current = zones
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  const measure = useCallback((zone: Zone) => heights.current.get(zone.id) ?? 60, [])

  /**
   * Rend le curseur au dernier cadre, à la fin de son texte. C'est ce que fait
   * le blanc sous un cahier empilé : on touche dessous, on continue d'écrire.
   */
  const resume = useCallback(() => {
    const order = readingOrder(zonesRef.current)
    const last = order[order.length - 1]
    const editor = last && editors.current.get(last.id)
    if (editor && !editor.isDestroyed) editor.commands.focus('end')
  }, [])

  /**
   * Un clic dans le vide ouvre un cadre là où l'on a cliqué — ou, quand les
   * cadres sont empilés, reprend le fil du dernier.
   */
  const openAt = useCallback(
    (event: React.MouseEvent) => {
      // Un clic *dans* un cadre appartient à ce cadre.
      if ((event.target as HTMLElement).closest('.zone')) return

      /*
       * Empilés, les cadres ne se posent plus où l'on veut : la toile n'a plus
       * de coordonnées. Le geste ne doit pas pour autant rester sans effet —
       * toucher le blanc sous le texte ne faisait rien du tout, ce qui est la
       * façon la plus sûre de croire que l'application est cassée.
       */
      if (stacked) {
        event.preventDefault()
        resume()
        return
      }

      const box = surface.current?.getBoundingClientRect()
      if (!box) return

      const born = {
        id: newId(),
        ...placeAt(box.width, event.clientX - box.left, event.clientY - box.top),
        html: '',
      }
      changeRef.current([...zonesRef.current, born])
      // Le curseur va dedans : cliquer puis écrire est le geste entier.
      setBorn(born.id)
    },
    [resume, stacked],
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
          onReady={(instance) => editors.current.set(zone.id, instance)}
          onGone={(instance) => {
            editors.current.delete(zone.id)
            onGone(instance)
          }}
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
  onReady,
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
  onReady: (editor: Editor) => void
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

  // Le cadre s'annonce quand il est prêt, pour que la toile puisse lui rendre
  // le curseur, et signale son départ pour que la barre d'outils cesse de
  // viser un éditeur détruit.
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const goneRef = useRef(onGone)
  goneRef.current = onGone
  useEffect(() => {
    if (!editor) return
    readyRef.current(editor)
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
      //
      // La largeur maximale le retient dans la feuille : sur une fenêtre
      // étroite, un cadre de 360 px posé sur une toile de 312 en sortait, et
      // sa partie droite n'était plus atteignable.
      style={
        stacked
          ? undefined
          : {
              left: zone.x,
              top: zone.y,
              width: zone.w || READING_WIDTH,
              maxWidth: `calc(100% - ${Math.max(0, Math.round(zone.x))}px)`,
            }
      }
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
