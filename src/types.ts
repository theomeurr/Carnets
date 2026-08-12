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

/** Une page : le contenu réel, rangé dans une section. */
export interface Page {
  id: Id
  sectionId: Id
  title: string
  /** Le contenu riche, sérialisé en HTML par l'éditeur. */
  html: string
  /** Le même contenu en texte brut : sert à la recherche et aux aperçus. */
  text: string
  createdAt: number
  updatedAt: number
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
export interface CarnetsState {
  version: number
  notebooks: Notebook[]
  sections: Section[]
  pages: Page[]
  selection: Selection
}
