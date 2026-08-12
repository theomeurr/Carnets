import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Chemins relatifs : le site fonctionne où qu'il soit servi — à la racine,
  // sous /Carnets/ d'une page de projet GitHub Pages, ou dans n'importe quel
  // sous-dossier. Un chemin absolu obligerait à connaître l'emplacement au
  // moment du build, et une page blanche serait le seul signe d'une erreur.
  // C'est sans risque ici : l'application tient en une seule page, sans routeur.
  base: './',

  plugins: [
    react(),

    VitePWA({
      // `prompt` et non `autoUpdate` : une mise à jour ne doit pas recharger la
      // page sous les doigts de quelqu'un en train d'écrire. On propose, il
      // décide.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon.svg'],

      manifest: {
        name: 'Carnets — prise de notes',
        short_name: 'Carnets',
        description:
          'Prise de notes en bloc-notes, sections et pages. Fonctionne hors ligne, tout reste sur votre appareil.',
        lang: 'fr',
        dir: 'ltr',
        // Relatifs, comme le reste : l'application s'installe depuis n'importe
        // quelle adresse sans reconfiguration.
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#ffffff',
        background_color: '#f4f4f6',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // « maskable » : le système peut y appliquer sa propre découpe
          // (cercle, goutte…) sans rogner le dessin.
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Toute l'application est mise en cache à l'installation : elle
        // démarre et fonctionne sans réseau, ce qui est cohérent avec des
        // notes qui ne quittent de toute façon jamais l'appareil.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Une navigation vers n'importe quelle adresse du périmètre rend la
        // page unique de l'application.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },

      devOptions: {
        // Le service worker reste désactivé en développement : sinon le cache
        // masque les modifications en cours.
        enabled: false,
      },
    }),
  ],

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
