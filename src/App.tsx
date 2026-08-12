import { useEffect, useState } from 'react'
import { PageEditor } from './components/PageEditor'
import { PageList } from './components/PageList'
import { SaveBanner } from './components/SaveBanner'
import { SearchDialog } from './components/SearchDialog'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { CarnetsProvider } from './store/CarnetsProvider'

export default function App() {
  return (
    <CarnetsProvider>
      <Workspace />
    </CarnetsProvider>
  )
}

function Workspace() {
  const [searching, setSearching] = useState(false)

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
      <TopBar onSearch={() => setSearching(true)} />
      <SaveBanner />
      <main className="columns">
        <Sidebar />
        <PageList />
        <PageEditor />
      </main>
      {searching && <SearchDialog onClose={() => setSearching(false)} />}
    </div>
  )
}
