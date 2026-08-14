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
import { choiceMade, rememberChoice } from './sync/welcome'

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
  /** Ouverte depuis le bandeau. */
  const [account, setAccount] = useState(false)
  /** A-t-on déjà tranché sur cet appareil ? Lu une fois, au montage. */
  const [chosen, setChosen] = useState(choiceMade)
  const { pane } = useMobilePane()

  // Un compte connu vaut choix fait : quelqu'un qui se connecte, ou qui l'est
  // déjà depuis une session précédente, ne doit plus voir la page s'imposer.
  useEffect(() => {
    if (!sync.account) return
    rememberChoice()
    setChosen(true)
  }, [sync.account])

  // Stable : la page s'en sert comme dépendance d'effet pour la touche Échap.
  const settle = useCallback(() => {
    rememberChoice()
    setChosen(true)
    setAccount(false)
  }, [])

  /*
   * La page s'impose à l'ouverture tant que la question n'a pas été tranchée,
   * et seulement une fois qu'on sait s'il y a une session : sans cette
   * attente, elle apparaîtrait puis disparaîtrait sous les yeux d'un compte
   * déjà connecté.
   */
  const showAccount = account || (sync.available && sync.resolved && !sync.account && !chosen)

  // Ctrl/⌘ + K ouvre la recherche depuis n'importe où, y compris en pleine
  // frappe dans l'éditeur.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
      {showAccount && <AccountPage onDone={settle} />}
    </>
  )
}
