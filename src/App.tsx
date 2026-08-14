import { useCallback, useEffect, useState } from 'react'
import { AccountPage } from './components/AccountPage'
import { MobilePaneProvider } from './components/MobilePane'
import { useMobilePane } from './components/paneContext'
import { PageEditor } from './components/PageEditor'
import { PageList } from './components/PageList'
import { SaveBanner } from './components/SaveBanner'
import { SearchDialog } from './components/SearchDialog'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { UpdatePrompt } from './components/UpdatePrompt'
import { FolioProvider } from './store/FolioProvider'
import { useFolio } from './store/useFolio'

export default function App() {
  return (
    <FolioProvider>
      <MobilePaneProvider>
        <Workspace />
      </MobilePaneProvider>
    </FolioProvider>
  )
}

function Workspace() {
  const { sync } = useFolio()
  const [searching, setSearching] = useState(false)
  /** Ouverte depuis le bandeau, alors qu'on est déjà connecté. */
  const [account, setAccount] = useState(false)
  const { pane } = useMobilePane()

  const close = useCallback(() => setAccount(false), [])

  /*
   * La connexion est obligatoire : sans compte, on ne passe pas. La page
   * attend cependant de savoir s'il y a une session — elle est relue du
   * disque à l'ouverture — sinon elle apparaîtrait puis disparaîtrait sous
   * les yeux d'un compte déjà connecté.
   *
   * Le cas `!sync.available` n'est pas un oubli : sans serveur configuré, il
   * n'y a pas de compte possible, et exiger une connexion reviendrait à
   * rendre l'application inutilisable. Folio reste alors purement local.
   */
  const showAccount = account || (sync.available && sync.resolved && !sync.account)

  // Ctrl/⌘ + K ouvre la recherche depuis n'importe où, y compris en pleine
  // frappe dans l'éditeur — mais pas depuis la page de compte. Le raccourci
  // est posé sur la fenêtre, et `inert` n'arrête pas ce qui vient de là : sans
  // cette réserve, il ouvrait la recherche derrière une connexion obligatoire.
  useEffect(() => {
    if (showAccount) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showAccount])

  return (
    <>
      {/* La page de compte recouvre tout : derrière elle, l'espace de travail
          ne doit plus être atteignable — ni à la tabulation, ni au lecteur
          d'écran. Il reste monté, donc on le retrouve intact en revenant. */}
      <div className="app" inert={showAccount}>
        <TopBar onSearch={() => setSearching(true)} onAccount={() => setAccount(true)} />
        <SaveBanner />
        <main className={`columns is-${pane}`}>
          <Sidebar />
          <PageList />
          <PageEditor />
        </main>
        {searching && <SearchDialog onClose={() => setSearching(false)} />}
        <UpdatePrompt />
      </div>
      {showAccount && <AccountPage onDone={close} />}
    </>
  )
}
