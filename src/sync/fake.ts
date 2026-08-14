import type { Changeset } from './merge'
import { AuthError, type Account, type Remote } from './remote'

/**
 * Un serveur en mémoire, qui se comporte comme le vrai : il range ce qu'on
 * lui pousse et rend ce qui a changé depuis une date. Il permet d'éprouver la
 * synchronisation — deux appareils, coupures, conflits — de façon
 * déterministe et sans réseau.
 *
 * Il sert aux tests ; il n'entre jamais dans le paquet de production.
 */
export function fakeRemote(): Remote & {
  /** Simule une panne de réseau pour les appels suivants. */
  offline: boolean
  /** Nombre d'appels reçus, pour vérifier qu'on ne parle pas pour rien. */
  pushes: number
} {
  const store = {
    notebooks: new Map<string, Changeset['notebooks'][number]>(),
    sections: new Map<string, Changeset['sections'][number]>(),
    pages: new Map<string, Changeset['pages'][number]>(),
    locks: new Map<string, Changeset['locks'][number]>(),
    tombstones: new Map<string, Changeset['tombstones'][number]>(),
  }
  let account: Account | null = null
  const listeners = new Set<(account: Account | null) => void>()
  const bells = new Set<() => void>()

  const remote = {
    offline: false,
    pushes: 0,

    async currentAccount() {
      return account
    },

    onAccountChange(listener: (account: Account | null) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async signUp(email: string) {
      account = { id: 'compte', email }
      listeners.forEach((l) => l(account))
      return account
    },

    async signIn(email: string, password: string) {
      if (password === 'faux') throw new AuthError('Adresse ou mot de passe incorrect.')
      account = { id: 'compte', email }
      listeners.forEach((l) => l(account))
      return account
    },

    async signOut() {
      account = null
      listeners.forEach((l) => l(null))
    },

    onRemoteChange(listener: () => void) {
      bells.add(listener)
      return () => bells.delete(listener)
    },

    async pull(since: number): Promise<Changeset> {
      if (remote.offline) throw new Error('Serveur injoignable')
      const after = <T extends { updatedAt: number }>(m: Map<string, T>): T[] =>
        [...m.values()].filter((e) => e.updatedAt > since)
      return {
        notebooks: after(store.notebooks),
        sections: after(store.sections),
        pages: after(store.pages),
        locks: after(store.locks),
        tombstones: [...store.tombstones.values()].filter((t) => t.deletedAt > since),
      }
    },

    async push(changes: Changeset): Promise<void> {
      if (remote.offline) throw new Error('Serveur injoignable')
      remote.pushes += 1
      for (const n of changes.notebooks) store.notebooks.set(n.id, { ...n })
      for (const s of changes.sections) store.sections.set(s.id, { ...s })
      for (const p of changes.pages) store.pages.set(p.id, { ...p })
      for (const l of changes.locks) store.locks.set(l.id, { ...l })
      // Comme en base : le genre fait partie de la clé, une page et son verrou
      // partageant le même identifiant.
      for (const t of changes.tombstones) store.tombstones.set(`${t.kind}:${t.id}`, { ...t })
      // Comme le vrai serveur : quelque chose a été écrit, les autres appareils
      // sont prévenus.
      bells.forEach((ring) => ring())
    },
  }

  return remote
}
