/** Identifiants opaques — un simple alias pour rendre les signatures lisibles. */
export type Id = string

/** Un bloc-notes : le niveau le plus haut du classeur. */
export interface Notebook {
  id: Id
  name: string
  /** Identifiant d'une couleur de `lib/colors.ts` (l'onglet visible sur le côté). */
  color: string
  createdAt: number
}

/** Une section : un intercalaire à l'intérieur d'un bloc-notes. */
export interface Section {
  id: Id
  notebookId: Id
  name: string
  createdAt: number
}

/**
 * Une page : le contenu réel, rangé dans une section.
 *
 * Quand la page est sous verrou, `title`, `html` et `text` sont **vides** et
 * tout est dans `cipher` — ce qui est écrit sur le disque est donc illisible,
 * y compris le titre. Le contenu en clair n'existe qu'en mémoire, le temps
 * d'une session déverrouillée.
 */
export interface Page {
  id: Id
  sectionId: Id
  title: string
  /** Le contenu riche, sérialisé en HTML par l'éditeur. */
  html: string
  /** Le même contenu en texte brut : sert à la recherche et aux aperçus. */
  text: string
  /** Titre et contenu chiffrés, quand la page est protégée. */
  cipher: string | null
  createdAt: number
  updatedAt: number
}

/** Ce qu'un verrou protège : un niveau du classeur. */
export type LockScope = 'notebook' | 'section' | 'page'

/**
 * Un verrou posé sur un bloc-notes, une section ou une page. On n'y trouve
 * rien de secret : ni le mot de passe, ni son empreinte. Le sel et le nombre
 * d'itérations servent à redériver la clé ; `verifier` est un texte témoin
 * chiffré, qui dit si un mot de passe proposé est le bon.
 */
export interface Lock {
  /** L'identifiant de la cible protégée — bloc-notes, section ou page. */
  id: Id
  scope: LockScope
  salt: string
  iterations: number
  verifier: string
  createdAt: number
}

/** Ce qui est ouvert à l'écran, une entrée par colonne. */
export interface Selection {
  notebookId: Id | null
  sectionId: Id | null
  pageId: Id | null
}

/**
 * L'état complet de l'application. Les collections sont plates : l'ordre
 * d'affichage est l'ordre du tableau, et le parent est porté par un champ
 * (`notebookId`, `sectionId`). Renommer ou supprimer touche donc une seule
 * entrée, sans avoir à retrouver un chemin dans un arbre.
 */
export interface FolioState {
  version: number
  notebooks: Notebook[]
  sections: Section[]
  pages: Page[]
  locks: Lock[]
  selection: Selection
}
