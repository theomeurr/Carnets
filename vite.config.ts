import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Une page de projet GitHub Pages est servie sous /<dépôt>/, alors qu'en
  // développement et sur un hébergeur classique la racine est `/`. La variable
  // n'est posée que par le workflow de publication.
  base: process.env.GITHUB_PAGES === 'true' ? '/Carnets/' : '/',
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
