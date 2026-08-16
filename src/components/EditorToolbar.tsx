import { useEditorState, type Editor } from '@tiptap/react'
import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

/**
 * Barre d'outils de l'éditeur : mise en forme du cadre où se trouve le
 * curseur. Tant qu'on n'a cliqué dans aucun cadre, il n'y a rien à mettre en
 * forme — elle se montre alors éteinte plutôt que de disparaître, pour que la
 * page ne saute pas de vingt pixels au premier clic.
 *
 * Les deux états sont deux composants, et non un retour anticipé : les
 * abonnements à l'éditeur ne peuvent pas être posés sous condition.
 */
export function EditorToolbar({
  editor,
  onAlign,
  stacked,
}: {
  /** L'éditeur du cadre qui a le curseur ; nul tant qu'on n'a pas cliqué dedans. */
  editor: Editor | null
  /** Fourni quand la page a plusieurs cadres à ranger. */
  onAlign?: () => void
  /** Vrai sur téléphone, où les cadres sont empilés : le geste n'est pas le même. */
  stacked?: boolean
}) {
  /*
   * Un éditeur détruit est traité comme absent. Le cas arrive : ouvrir un
   * cadre puis cliquer ailleurs efface le premier s'il est resté vide, et son
   * éditeur disparaît alors que la barre le tient encore. L'interroger le
   * faisait planter — donc écran noir, l'application entière démontée.
   */
  const live = editor && !editor.isDestroyed ? editor : null

  return live ? (
    <ActiveToolbar editor={live} onAlign={onAlign} />
  ) : (
    <div className="toolbar" role="toolbar" aria-label="Mise en forme">
      {/*
       * Sur téléphone les cadres sont empilés : on ne les pose pas où l'on
       * veut, et promettre le contraire donnait un repère qui mentait — on
       * touchait la page en suivant son conseil, sans que rien n'arrive.
       */}
      <span className="toolbar__hint">
        {stacked ? 'Touchez la page pour écrire.' : 'Cliquez où vous voulez écrire.'}
      </span>
      {onAlign && <AlignTool onAlign={onAlign} />}
    </div>
  )
}

function AlignTool({ onAlign }: { onAlign: () => void }) {
  return (
    <Tool
      label="Tout aligner"
      onClick={onAlign}
      // Le seul outil qui agit sur la page entière, et non sur un cadre : il
      // se tient donc à l'écart, au bout de la barre.
      className="toolbar__button is-apart"
    >
      <Glyph d="M4 5h16M4 10h10M4 15h16M4 20h10" />
    </Tool>
  )
}

function ActiveToolbar({ editor, onAlign }: { editor: Editor; onAlign?: () => void }) {
  const [linkOpen, setLinkOpen] = useState(false)

  /*
   * Un seul abonnement à l'éditeur : le composant ne se redessine que lorsque
   * l'un de ces drapeaux change, pas à chaque frappe.
   *
   * Le sélecteur se garde d'un éditeur détruit, et cette précaution est bien à
   * *sa* place : il est appelé hors rendu, sur notification, donc après que le
   * cadre a disparu et avant que le parent n'ait eu l'occasion de le remplacer.
   * Interroger un éditeur mort emportait toute l'application — écran noir.
   */
  const marks = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance && !instance.isDestroyed ? read(instance) : IDLE,
  })

  const setBlock = (value: string) => {
    const chain = editor.chain().focus()
    if (value === 'p') chain.setParagraph().run()
    else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run()
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Mise en forme">
      <select
        className="toolbar__select"
        aria-label="Style de paragraphe"
        value={marks.block}
        onChange={(event) => setBlock(event.target.value)}
      >
        <option value="p">Normal</option>
        <option value="h1">Titre 1</option>
        <option value="h2">Titre 2</option>
        <option value="h3">Titre 3</option>
      </select>

      <Divider />

      <Tool
        label="Gras"
        shortcut="Ctrl+B"
        active={marks.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>G</strong>
      </Tool>
      <Tool
        label="Italique"
        shortcut="Ctrl+I"
        active={marks.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </Tool>
      <Tool
        label="Souligné"
        shortcut="Ctrl+U"
        active={marks.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span style={{ textDecoration: 'underline' }}>S</span>
      </Tool>
      <Tool
        label="Barré"
        active={marks.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span style={{ textDecoration: 'line-through' }}>B</span>
      </Tool>
      <Tool
        label="Code en ligne"
        active={marks.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Glyph d="m9 8-4 4 4 4M15 8l4 4-4 4" />
      </Tool>

      <Divider />

      <Tool
        label="Liste à puces"
        active={marks.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <Glyph d="M9 6h11M9 12h11M9 18h11" dots={[6, 12, 18]} />
      </Tool>
      <Tool
        label="Liste numérotée"
        active={marks.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <Glyph d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 15h2v2H4v2h2" />
      </Tool>
      <Tool
        label="Liste de tâches"
        active={marks.taskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <Glyph d="M11 6h9M11 12h9M11 18h9M3 6l1.5 1.5L7.5 4.5M3 12l1.5 1.5L7.5 10.5M3 18l1.5 1.5L7.5 16.5" />
      </Tool>
      <Tool
        label="Citation"
        active={marks.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Glyph d="M5 5v14M10 8h9M10 12h9M10 16h5" />
      </Tool>
      <Tool
        label="Bloc de code"
        active={marks.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Glyph d="M4 5h16v14H4zM9 10l-2 2 2 2M15 10l2 2-2 2" />
      </Tool>

      <Divider />

      <Tool label="Lien" active={marks.link} onClick={() => setLinkOpen(true)}>
        <Glyph d="M10 14a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1-1" />
      </Tool>
      {marks.link && (
        <Tool label="Retirer le lien" onClick={() => editor.chain().focus().unsetLink().run()}>
          <Glyph d="M9 15 5.5 18.5M10 14a4 4 0 0 0 5.7 0l2-2M14 10a4 4 0 0 0-5.7 0l-2 2M4 4l16 16" />
        </Tool>
      )}

      <Divider />

      <Tool
        label="Annuler"
        shortcut="Ctrl+Z"
        disabled={!marks.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Glyph d="M9 7 5 11l4 4M5 11h9a5 5 0 0 1 0 10h-3" />
      </Tool>
      <Tool
        label="Rétablir"
        shortcut="Ctrl+Maj+Z"
        disabled={!marks.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Glyph d="m15 7 4 4-4 4M19 11h-9a5 5 0 0 0 0 10h3" />
      </Tool>

      {onAlign && <AlignTool onAlign={onAlign} />}

      {linkOpen && (
        <LinkDialog
          initial={editor.getAttributes('link').href ?? ''}
          onClose={() => setLinkOpen(false)}
          onSubmit={(href) => {
            setLinkOpen(false)
            const chain = editor.chain().focus()
            if (!href) chain.unsetLink().run()
            else chain.extendMarkRange('link').setLink({ href }).run()
          }}
        />
      )}
    </div>
  )
}

/** Ce que la barre lit dans l'éditeur pour se dessiner. */
function read(instance: Editor) {
  return {
    bold: instance.isActive('bold'),
    italic: instance.isActive('italic'),
    underline: instance.isActive('underline'),
    strike: instance.isActive('strike'),
    code: instance.isActive('code'),
    bulletList: instance.isActive('bulletList'),
    orderedList: instance.isActive('orderedList'),
    taskList: instance.isActive('taskList'),
    blockquote: instance.isActive('blockquote'),
    codeBlock: instance.isActive('codeBlock'),
    link: instance.isActive('link'),
    block: instance.isActive('heading', { level: 1 })
      ? 'h1'
      : instance.isActive('heading', { level: 2 })
        ? 'h2'
        : instance.isActive('heading', { level: 3 })
          ? 'h3'
          : 'p',
    canUndo: instance.can().undo(),
    canRedo: instance.can().redo(),
  }
}

/**
 * L'état d'un éditeur qu'on ne peut plus interroger. Constante, et non un
 * objet neuf : `useEditorState` compare ce qu'on lui rend, et une nouvelle
 * référence à chaque appel provoquerait un rendu sans fin.
 */
const IDLE: ReturnType<typeof read> = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  blockquote: false,
  codeBlock: false,
  link: false,
  block: 'p',
  canUndo: false,
  canRedo: false,
}

function Tool({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`${className ?? 'toolbar__button'} ${active ? 'is-active' : ''}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // `onMouseDown` bloqué : sans cela, le clic vole le focus à l'éditeur et
      // la sélection à mettre en forme disparaît avant l'exécution.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="toolbar__divider" aria-hidden="true" />
}

function Glyph({ d, dots }: { d: string; dots?: number[] }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
      {dots?.map((y) => <circle key={y} cx="4.5" cy={y} r="1.2" fill="currentColor" />)}
    </svg>
  )
}

/** Saisie d'une adresse pour le lien ; un champ vide retire le lien existant. */
function LinkDialog({
  initial,
  onSubmit,
  onClose,
}: {
  initial: string
  onSubmit: (href: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const href = value.trim()

  const submit = () => {
    if (!href) {
      onSubmit('')
      return
    }
    // Sans schéma, une adresse serait comprise comme un chemin relatif.
    onSubmit(/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`)
  }

  return (
    <Modal
      title="Lien"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="button is-primary" onClick={submit}>
            {href ? 'Appliquer' : 'Retirer le lien'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Adresse</span>
        <input
          className="field__input"
          value={value}
          placeholder="exemple.fr/page"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
        />
      </label>
    </Modal>
  )
}
