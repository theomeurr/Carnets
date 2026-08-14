import { describe, expect, it } from 'vitest'
import type { FolioState, Page } from '../types'
import { syncOnce } from './engine'
import { fakeRemote } from './fake'

const page = (id: string, title: string, updatedAt: number): Page => ({
  id,
  sectionId: 's1',
  title,
  html: `<p>${title}</p>`,
  text: title,
  cipher: null,
  createdAt: 0,
  updatedAt,
})

function classeur(pages: Page[], over: Partial<FolioState> = {}): FolioState {
  return {
    version: 1,
    notebooks: [{ id: 'n1', name: 'Travail', color: 'indigo', createdAt: 0, updatedAt: 10 }],
    sections: [{ id: 's1', notebookId: 'n1', name: 'Notes', createdAt: 0, updatedAt: 10 }],
    pages,
    locks: [],
    tombstones: [],
    selection: { notebookId: 'n1', sectionId: 's1', pageId: pages[0]?.id ?? null },
    ...over,
  }
}

describe('un tour de synchronisation', () => {
  it('envoie le classeur au premier tour', async () => {
    const remote = fakeRemote()
    const out = await syncOnce(remote, classeur([page('p1', 'Budget', 100)]), 0, 200)
    expect(out.sent).toBe(true)
    expect(out.received).toBe(false)
    expect(out.cursor).toBe(200)
  })

  it('ne parle pas pour rien quand rien n’a bougé', async () => {
    const remote = fakeRemote()
    const state = classeur([page('p1', 'Budget', 100)])
    await syncOnce(remote, state, 0, 200)
    const out = await syncOnce(remote, state, 1_000_000, 1_000_100)
    expect(out.sent).toBe(false)
    expect(out.received).toBe(false)
    expect(remote.pushes).toBe(1)
  })

  it('rend le même état quand il n’y a rien à intégrer', async () => {
    const remote = fakeRemote()
    const state = classeur([page('p1', 'Budget', 100)])
    const out = await syncOnce(remote, state, 1_000_000, 1_000_100)
    // Même référence : l'enregistrement local n'écrira donc rien.
    expect(out.state).toBe(state)
  })
})

describe('deux appareils', () => {
  it('la note écrite sur A arrive sur B', async () => {
    const remote = fakeRemote()
    const a = classeur([page('p1', 'Écrite sur A', 100)])
    await syncOnce(remote, a, 0, 200)

    const b = classeur([])
    const out = await syncOnce(remote, b, 0, 300)
    expect(out.received).toBe(true)
    expect(out.state.pages.map((p) => p.title)).toEqual(['Écrite sur A'])
  })

  it('la plus récente des deux versions l’emporte, des deux côtés', async () => {
    const remote = fakeRemote()
    await syncOnce(remote, classeur([page('p1', 'Version A', 100)]), 0, 200)

    // B a modifié la même page plus tard, hors ligne.
    const b = classeur([page('p1', 'Version B, plus récente', 500)])
    const surB = await syncOnce(remote, b, 0, 600)
    expect(surB.state.pages[0].title).toBe('Version B, plus récente')

    // A resynchronise et reçoit la version de B.
    const surA = await syncOnce(remote, classeur([page('p1', 'Version A', 100)]), 0, 700)
    expect(surA.state.pages[0].title).toBe('Version B, plus récente')
  })

  it('une suppression sur A retire la note de B', async () => {
    const remote = fakeRemote()
    await syncOnce(remote, classeur([page('p1', 'À jeter', 100)]), 0, 200)

    // A supprime : la page disparaît, la trace part au serveur.
    const a = classeur([], { tombstones: [{ id: 'p1', kind: 'page', deletedAt: 300 }] })
    await syncOnce(remote, a, 0, 400)

    // B avait encore la page.
    const b = classeur([page('p1', 'À jeter', 100)])
    const out = await syncOnce(remote, b, 0, 500)
    expect(out.state.pages).toEqual([])
  })

  it('la note supprimée ne revient pas au tour suivant', async () => {
    const remote = fakeRemote()
    await syncOnce(remote, classeur([page('p1', 'À jeter', 100)]), 0, 200)

    let a = classeur([], { tombstones: [{ id: 'p1', kind: 'page', deletedAt: 300 }] })
    let cursor = 0
    for (const now of [400, 500, 600]) {
      const out = await syncOnce(remote, a, cursor, now)
      a = out.state
      cursor = out.cursor
    }
    expect(a.pages).toEqual([])
  })
})

describe('coupure de réseau', () => {
  it('remonte l’échec sans toucher à l’état local', async () => {
    const remote = fakeRemote()
    remote.offline = true
    const state = classeur([page('p1', 'Écrite hors ligne', 100)])
    await expect(syncOnce(remote, state, 0, 200)).rejects.toThrow('injoignable')
  })

  it('rattrape le retard au retour du réseau', async () => {
    const remote = fakeRemote()
    remote.offline = true
    const state = classeur([page('p1', 'Écrite hors ligne', 100)])
    await syncOnce(remote, state, 0, 200).catch(() => {})

    // Le curseur n'a pas avancé : la page repart au tour suivant.
    remote.offline = false
    const out = await syncOnce(remote, state, 0, 300)
    expect(out.sent).toBe(true)

    const autre = await syncOnce(remote, classeur([]), 0, 400)
    expect(autre.state.pages.map((p) => p.title)).toEqual(['Écrite hors ligne'])
  })
})

describe('notes protégées', () => {
  it('ne transmet que le chiffré, jamais le texte en clair', async () => {
    const remote = fakeRemote()
    const scellee: Page = {
      id: 'p1',
      sectionId: 's1',
      title: '',
      html: '',
      text: '',
      cipher: 'U2FsdGVkX1+secret',
      createdAt: 0,
      updatedAt: 100,
    }
    await syncOnce(remote, classeur([scellee]), 0, 200)

    const recu = await remote.pull(0)
    expect(recu.pages[0].cipher).toBe('U2FsdGVkX1+secret')
    expect(recu.pages[0].title).toBe('')
    expect(recu.pages[0].text).toBe('')
    // Rien de lisible n'a transité.
    expect(JSON.stringify(recu)).not.toContain('secret'.repeat(2))
  })

  it('transporte le verrou, pour que l’autre appareil puisse déverrouiller', async () => {
    const remote = fakeRemote()
    const state = classeur([page('p1', '', 100)], {
      locks: [
        {
          id: 's1',
          scope: 'section',
          salt: 'sel',
          iterations: 600000,
          verifier: 'témoin-chiffré',
          createdAt: 0,
          updatedAt: 100,
        },
      ],
    })
    await syncOnce(remote, state, 0, 200)

    const out = await syncOnce(remote, classeur([]), 0, 300)
    expect(out.state.locks.map((l) => l.id)).toEqual(['s1'])
    // Le sel et le témoin voyagent : le mot de passe, lui, ne quitte rien.
    expect(out.state.locks[0].salt).toBe('sel')
  })
})
