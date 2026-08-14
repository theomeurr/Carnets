import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface Printable {
  title: string
  /** Le chemin dans le classeur, en en-tête de la feuille. */
  breadcrumb: string
  /** Le contenu riche, tel que l'éditeur l'a écrit. */
  html: string
  updatedAt: number
}

/**
 * L'export PDF.
 *
 * Il passe par l'impression du navigateur plutôt que par une bibliothèque
 * embarquée, et c'est un choix : les bibliothèques disponibles photographient
 * la page, ce qui donne un PDF dont le texte n'est ni sélectionnable ni
 * cherchable, pèse lourd, et rend mal les accents. Le moteur du navigateur,
 * lui, produit un vrai document — et « Enregistrer au format PDF » est une
 * destination d'impression sur tous les systèmes visés.
 *
 * On monte donc une feuille propre hors de l'application, et la feuille de
 * style d'impression ne laisse voir qu'elle.
 */
export function PrintSheet({ page, onDone }: { page: Printable; onDone: () => void }) {
  useEffect(() => {
    // `afterprint` se déclenche que l'on imprime ou que l'on annule : dans les
    // deux cas la feuille a fini son office.
    const finish = () => onDone()
    window.addEventListener('afterprint', finish)

    // Un tour de boucle pour que la feuille soit posée avant l'ouverture de la
    // boîte d'impression, qui fige le rendu.
    const timer = setTimeout(() => window.print(), 60)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('afterprint', finish)
    }
  }, [onDone])

  /*
   * Posée sur `document.body`, et non là où le composant est monté : la
   * feuille de style d'impression masque `.app`, et un enfant d'un élément
   * masqué n'est pas rendu du tout. Rendue en place, elle ne s'imprimerait
   * jamais — la page sortait blanche.
   */
  return createPortal(
    <div className="print-sheet" aria-hidden="true">
      <p className="print-sheet__path">{page.breadcrumb}</p>
      <h1 className="print-sheet__title">{page.title}</h1>
      <p className="print-sheet__date">
        Modifié le{' '}
        {new Date(page.updatedAt).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
      {/*
        Le HTML vient de l'éditeur, jamais du dehors : Tiptap n'écrit que les
        nœuds de son schéma, et le contenu collé passe par ce même filtre.
      */}
      <div className="prose print-sheet__body" dangerouslySetInnerHTML={{ __html: page.html }} />
    </div>,
    document.body,
  )
}
