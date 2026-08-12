import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Chemins relatifs : le site fonctionne où qu'il soit servi — à la racine,
  // sous /Carnets/ d'une page de projet GitHub Pages, ou dans n'importe quel
  // sous-dossier. Un chemin absolu obligerait à connaître l'emplacement au
  // moment du build, et une page blanche serait le seul signe d'une erreur.
  // C'est sans risque ici : l'application tient en une seule page, sans routeur.
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // L'éditeur (ProseMirror + Tiptap) pèse l'essentiel du poids et ne
        // bouge qu'aux montées de version : dans son propre fichier, il reste
        // en cache quand seul le code de l'application change.
        manualChunks: (id: string) =>
          id.includes('node_modules') && /prosemirror|tiptap/.test(id) ? 'editeur' : undefined,
      },
    },
  },
})
