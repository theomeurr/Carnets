import { newId } from '../lib/id'
import { htmlToText } from '../lib/text'
import type { CarnetsState, Page, Section } from '../types'
import { STATE_VERSION } from './storage'

/**
 * Le classeur du premier lancement : un bloc-notes, deux sections, trois pages
 * qui expliquent l'application en la montrant. Rien ici n'est spécial — tout est
 * modifiable ou supprimable comme n'importe quelle note.
 */
export function seed(): CarnetsState {
  const now = Date.now()
  const notebook = {
    id: newId(),
    name: 'Mon premier bloc-notes',
    color: 'indigo',
    createdAt: now,
  }

  const prise: Section = {
    id: newId(),
    notebookId: notebook.id,
    name: 'Prise en main',
    createdAt: now,
  }
  const idees: Section = {
    id: newId(),
    notebookId: notebook.id,
    name: 'Idées',
    createdAt: now,
  }

  const pages: Page[] = [
    page(prise.id, 'Bienvenue dans Carnets', now, [
      '<p>Carnets range vos notes comme un vrai classeur, sur trois niveaux : <strong>bloc-notes</strong> → <strong>sections</strong> → <strong>pages</strong>.</p>',
      '<h2>Les trois colonnes</h2>',
      '<ul>',
      '<li><p>À gauche, vos bloc-notes et les sections de celui qui est ouvert.</p></li>',
      '<li><p>Au milieu, les pages de la section active.</p></li>',
      '<li><p>À droite, la page ouverte — vous y êtes.</p></li>',
      '</ul>',
      '<h2>Rien à enregistrer</h2>',
      '<p>Tout est sauvegardé pendant que vous écrivez. L’indicateur en haut à droite passe de <em>Enregistrement…</em> à <em>Enregistré</em> tout seul.</p>',
      '<blockquote><p>Astuce : <code>Ctrl</code> + <code>K</code> ouvre la recherche, qui fouille les titres et le contenu de toutes vos pages, tous bloc-notes confondus.</p></blockquote>',
    ]),
    page(prise.id, 'Mettre en forme', now, [
      '<p>La barre d’outils au-dessus de la page donne accès à tout le nécessaire.</p>',
      '<h2>Un titre de niveau 2</h2>',
      '<h3>Un titre de niveau 3</h3>',
      '<p>Du texte <strong>gras</strong>, <em>italique</em>, <u>souligné</u>, <s>barré</s>, du <code>code en ligne</code> et un <a href="https://developer.mozilla.org">lien</a>.</p>',
      '<ul><li><p>Une liste à puces</p></li><li><p>pour énumérer sans ordre</p></li></ul>',
      '<ol><li><p>Une liste numérotée</p></li><li><p>quand l’ordre compte</p></li></ol>',
      '<blockquote><p>Une citation, pour mettre une phrase de côté.</p></blockquote>',
      '<pre><code>const bonjour = () =&gt; "et un bloc de code."</code></pre>',
      '<p>Les raccourcis habituels fonctionnent : <code>Ctrl</code> + <code>B</code>, <code>Ctrl</code> + <code>I</code>, <code>Ctrl</code> + <code>U</code>. En début de ligne, <code>##</code> puis une espace crée un titre, <code>-</code> une liste, <code>&gt;</code> une citation.</p>',
    ]),
    page(idees.id, 'À essayer', now, [
      '<p>Quelques pistes pour prendre vos marques :</p>',
      '<ul>',
      '<li><p>Créer un bloc-notes par domaine — travail, personnel, projets — chacun avec sa couleur.</p></li>',
      '<li><p>Découper chaque bloc-notes en sections par thème.</p></li>',
      '<li><p>Renommer ou supprimer n’importe quel élément par le bouton <strong>⋯</strong> qui apparaît au survol.</p></li>',
      '</ul>',
      '<p>Et si cette page ne vous sert pas : supprimez-la, c’est votre classeur.</p>',
    ]),
  ]

  return {
    version: STATE_VERSION,
    notebooks: [notebook],
    sections: [prise, idees],
    pages,
    selection: { notebookId: notebook.id, sectionId: prise.id, pageId: pages[0].id },
  }
}

function page(sectionId: string, title: string, now: number, lines: string[]): Page {
  const html = lines.join('')
  return {
    id: newId(),
    sectionId,
    title,
    html,
    text: htmlToText(html),
    createdAt: now,
    updatedAt: now,
  }
}
