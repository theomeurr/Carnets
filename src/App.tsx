import { useEffect, useState } from 'react'
import { AccountDialog } from './components/AccountDialog'
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
  const [searching, setSearching] = useState(false)
  const [account, setAccount] = useState(false)
  const { pane } = useMobilePane()

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
    <div className="app">
      <TopBar onSearch={() => setSearching(true)} onAccount={() => setAccount(true)} />
      <SaveBanner />
      <main className={`columns is-${pane}`}>
        <Sidebar />
        <PageList />
        <PageEditor />
      </main>
      {searching && <SearchDialog onClose={() => setSearching(false)} />}
      {account && <AccountDialog onClose={() => setAccount(false)} />}
      <UpdatePrompt />
    </div>
  )
}
