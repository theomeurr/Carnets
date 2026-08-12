import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { requestPersistentStorage } from './lib/persist-storage'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Hors du chemin critique : le rendu n'attend pas la réponse du navigateur.
void requestPersistentStorage()
