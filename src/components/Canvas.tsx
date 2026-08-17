import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extension-placeholder'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { newId } from '../lib/id'
import { FULL_WIDTH, isBlank, type Zone } from '../lib/zones'
import { IconPlus, IconTrash } from './Icons'
import { useReorder } from './useReorder'

/**
 * Les blocs d'une page : des morceaux de texte que l'on ajoute un à un, et que
 * l'on réordonne ensuite.
 *
 * Ils s'empilent — ils ne se posent plus où l'on veut. Poser du texte à un
 * endroit libre de la feuille demandait de viser un vide invisible, et le
 * moindre pixel de trop mettait le curseur dans le bloc d'à côté sans rien
 * dire. Un bouton qui ajoute un bloc et une poignée qui le déplace disent au
 * contraire ce qu'ils font.
 *
 * Le déplacement passe par `useReorder`, comme les bloc-notes et les pages :
 * même geste à la souris, au doigt et au clavier, et un seul endroit à
 * corriger. Le corps d'un bloc appartenant à l'éditeur, la prise est une
 * poignée dédiée.
 */

export interface CanvasProps {
  zones: Zone[]
  onChange: (zones: Zone[]) => void
  /** L'éditeur du bloc qui a le curseur : c'est lui que la barre d'outils vise. */
  onActive: (editor: Editor | null) => void
  /** Prévient qu'un bloc s'en va, pour ne pas garder son éditeur détruit. */
  onGone: (editor: Editor) => void
}

export function Canvas({ zones, onChange, onActive, onGone }: CanvasProps) {
  /** Les éditeurs vivants, pour pouvoir rendre le curseur à l'un d'eux. */
  const editors = useRef(new Map<string, Editor>())
  /** Le bloc qui vient de naître : il réclame le curseur, une seule fois. */
  const [born, setBorn] = useState<string | null>(null)

  const zonesRef = useRef(zones)
  zonesRef.current = zones
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  /** Rend le curseur à un bloc, à la fin de son texte. */
  const enter = useCallback((id: string | undefined) => {
    const editor = id && editors.current.get(id)
    if (editor && !editor.isDestroyed) editor.commands.focus('end')
  }, [])

  /** Ajoute un bloc à la fin, et y met le curseur : ajouter, c'est écrire. */
  const append = useCallback(() => {
    const fresh = { id: newId(), x: 0, y: 0, w: FULL_WIDTH, html: '' }
    changeRef.current([...zonesRef.current, fresh])
    setBorn(fresh.id)
  }, [])

  /**
   * Retire un bloc. Le dernier ne se retire pas : une page sans bloc n'aurait
   * plus rien où écrire, et il faudrait un geste de plus pour la rouvrir.
   */
  const remove = useCallback(
    (id: string) => {
      const list = zonesRef.current
      if (list.length < 2) return
      const index = list.findIndex((zone) => zone.id === id)
      changeRef.current(list.filter((zone) => zone.id !== id))
      // Le curseur passe au bloc qui prend la place, sinon la barre d'outils
      // viserait un éditeur qui n'existe plus.
      enter((list[index + 1] ?? list[index - 1])?.id)
    },
    [enter],
  )

  /**
   * Déplace un bloc. `to` se compte dans la liste privée du bloc déplacé,
   * comme partout ailleurs dans `useReorder`.
   */
  const move = useCallback((id: string, to: number) => {
    const list = zonesRef.current
    const moved = list.find((zone) => zone.id === id)
    if (!moved) return
    const others = list.filter((zone) => zone.id !== id)
    const next = [...others.slice(0, to), moved, ...others.slice(to)]
    // Reposer un bloc à sa place n'est pas une modification : l'écrire
    // marquerait la page comme changée à chaque clic sur une poignée.
    if (next.every((zone, index) => zone === list[index])) return
    changeRef.current(next)
  }, [])

  const drag = useReorder(
    zones.map((zone) => zone.id),
    move,
  )

  /** Un bloc quitté sans rien y écrire s'efface. */
  const prune = useCallback((id: string) => {
    const zone = zonesRef.current.find((candidate) => candidate.id === id)
    if (!zone || !isBlank(zone) || zonesRef.current.length < 2) return
    changeRef.current(zonesRef.current.filter((candidate) => candidate.id !== id))
  }, [])

  /**
   * Le blanc sous les blocs rend le curseur au dernier. C'est le geste du
   * cahier : on touche sous le texte, on continue d'écrire. Sans lui, tout ce
   * bas de page ne répondait à rien.
   */
  const resume = useCallback(
    (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).closest('.block, button')) return
      event.preventDefault()
      enter(zonesRef.current[zonesRef.current.length - 1]?.id)
    },
    [enter],
  )

  return (
    <div className={`canvas ${drag.dragging ? 'is-handling' : ''}`} onMouseDown={resume}>
      {zones.map((zone, index) => {
        const { ref, onPointerDown, onKeyDown } = drag.itemProps(zone.id)
        const side = drag.dropSide(zone.id)
        return (
          <BlockEditor
            key={zone.id}
            zone={zone}
            first={index === 0}
            alone={zones.length < 2}
            className={`${drag.dragging === zone.id ? 'is-dragging' : ''} ${side ? `is-drop-${side}` : ''}`}
            hold={ref}
            onGrab={onPointerDown}
            onKeys={onKeyDown}
            claimFocus={born === zone.id}
            onFocused={() => setBorn(null)}
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
            onRemove={() => remove(zone.id)}
          />
        )
      })}

      <button type="button" className="canvas__add" onClick={append}>
        <IconPlus />
        Nouveau bloc
      </button>
    </div>
  )
}

function BlockEditor({
  zone,
  first,
  alone,
  className,
  hold,
  onGrab,
  onKeys,
  claimFocus,
  onFocused,
  onHtml,
  onActive,
  onReady,
  onGone,
  onLeave,
  onRemove,
}: {
  zone: Zone
  /** Seul le premier bloc porte l'invite : la répéter ferait un mur de gris. */
  first: boolean
  /** Un bloc seul ne se supprime pas : la page n'aurait plus où écrire. */
  alone: boolean
  className: string
  hold: (element: HTMLElement | null) => void
  onGrab: (event: ReactPointerEvent) => void
  onKeys: (event: ReactKeyboardEvent) => void
  claimFocus: boolean
  onFocused: () => void
  onHtml: (html: string) => void
  onActive: (editor: Editor | null) => void
  onReady: (editor: Editor) => void
  onGone: (editor: Editor) => void
  onLeave: () => void
  onRemove: () => void
}) {
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
      ...(first ? [Placeholder.configure({ placeholder: 'Commencez à écrire…' })] : []),
    ],
    content: zone.html,
    editorProps: {
      attributes: { class: 'prose', 'aria-label': 'Contenu du bloc', spellcheck: 'true' },
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

  // Le bloc s'annonce quand il est prêt, pour qu'on puisse lui rendre le
  // curseur, et signale son départ pour que la barre d'outils cesse de viser
  // un éditeur détruit.
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const goneRef = useRef(onGone)
  goneRef.current = onGone
  useEffect(() => {
    if (!editor) return
    readyRef.current(editor)
    return () => goneRef.current(editor)
  }, [editor])

  // Un bloc qu'on vient d'ajouter prend le curseur : ajouter puis écrire est
  // le geste entier.
  useEffect(() => {
    if (!claimFocus || !editor) return
    editor.commands.focus('end')
    onFocused()
  }, [claimFocus, editor, onFocused])

  return (
    <div
      ref={hold}
      className={`block ${className}`}
      data-zone-id={zone.id}
      // Les touches sont écoutées sur le bloc entier : Alt + flèche déplace
      // alors le bloc sans qu'on ait à quitter le texte qu'on écrit.
      onKeyDown={onKeys}
    >
      <div className="block__gutter">
        <button
          type="button"
          className="block__grab"
          data-drag-handle
          aria-label="Déplacer ce bloc"
          title="Déplacer ce bloc (ou Alt + flèches)"
          onPointerDown={onGrab}
        >
          <Grip />
        </button>
        {!alone && (
          <button
            type="button"
            className="block__remove"
            aria-label="Supprimer ce bloc"
            title="Supprimer ce bloc"
            onClick={onRemove}
          >
            <IconTrash />
          </button>
        )}
      </div>
      <EditorContent editor={editor} className="block__content" />
    </div>
  )
}

/** Les six points d'une poignée, le dessin usuel de « ceci se saisit ». */
function Grip() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      {[4, 8, 12].map((y) => (
        <g key={y}>
          <circle cx="6" cy={y} r="1.4" />
          <circle cx="10" cy={y} r="1.4" />
        </g>
      ))}
    </svg>
  )
}
