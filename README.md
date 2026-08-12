# Carnets

Une application de prise de notes organisée comme un vrai classeur, sur trois
niveaux : **bloc-notes → sections → pages**.

- Autant de **bloc-notes** que voulu, chacun avec sa couleur, visible comme un
  onglet sur la tranche de la ligne.
- Des **sections** dans chaque bloc-notes, pour ranger les pages par thème.
- Des **pages** avec un éditeur de texte riche : titres, gras, italique,
  souligné, barré, listes à puces et numérotées, citations, code en ligne,
  blocs de code, liens.
- **Rien à enregistrer** : tout est écrit pendant la frappe, et l'indicateur du
  bandeau dit où en est la sauvegarde.
- **Recherche globale** (`Ctrl`/`⌘` + `K`) dans les titres et le contenu de
  toutes les pages, tous bloc-notes confondus, sans se soucier des accents ni
  de la casse.
- **Renommer** (double-clic ou menu `⋯`) et **supprimer** n'importe quel niveau,
  à tout moment.

L'interface tient en trois colonnes : les bloc-notes et leurs sections à
gauche, les pages de la section ouverte au milieu, la page à droite.

## Démarrer

```bash
npm install
npm run dev      # serveur de développement
npm test         # tests unitaires (reducer, recherche)
npm run lint     # oxlint
npm run build    # vérification des types + build de production
```

## Sous le capot

React 19 + TypeScript, [Tiptap](https://tiptap.dev) (ProseMirror) pour
l'éditeur, Vite pour le build. Aucun serveur : les notes vivent dans le
`localStorage` du navigateur.

### Organisation du code

```
src/
  types.ts               le modèle : Notebook, Section, Page, Selection
  store/
    reducer.ts           toutes les transitions d'état, fonctions pures
    CarnetsProvider.tsx  l'état, les actions, l'enregistrement automatique
    context.ts           le contrat exposé à l'interface
    useCarnets.ts        accès à l'état et vues dérivées des trois colonnes
    storage.ts           lecture/écriture localStorage, avec validation
    seed.ts              le classeur du premier lancement
  lib/
    search.ts            recherche globale, classement et extraits
    text.ts              repliage des accents, HTML → texte, dates
    colors.ts            la palette des bloc-notes
  components/            les trois colonnes, la barre d'outils, la recherche
  styles/                jetons de couleur, ossature, rendu du texte riche
```

### Quelques partis pris

**Des collections plates.** `notebooks`, `sections` et `pages` sont trois
tableaux ; le parent est un champ (`notebookId`, `sectionId`) et l'ordre
d'affichage est celui du tableau. Renommer ou supprimer touche donc une seule
entrée, sans parcours d'arbre.

**Une sélection qui se rattrape toute seule.** Après chaque action, `settle()`
redescend les trois niveaux et retombe sur le premier voisin disponible dès
qu'un maillon ne pointe plus sur rien. C'est ce qui rend les suppressions
triviales : chaque action retire ses données, et la vue rouvre quelque chose de
valide — jusqu'au classeur vide.

**Deux temporisations pour l'enregistrement.** L'éditeur renvoie son contenu au
magasin après 300 ms sans frappe ; le magasin écrit dans le navigateur après
400 ms sans changement. On ne sérialise donc pas le classeur à chaque
caractère, et une fermeture d'onglet en pleine frappe force l'écriture.

**Un éditeur par page.** La surface d'édition est montée avec l'identifiant de
la page pour clé : changer de page reconstruit l'éditeur, ce qui garantit un
contenu propre et un historique d'annulation qui ne déborde pas d'une page sur
l'autre.

**Pas de HTML réinjecté.** Le contenu riche ne traverse que l'éditeur, qui le
filtre par son schéma. Les aperçus, les extraits de recherche et le surlignage
sont construits à partir du texte brut et rendus comme des éléments React.
