import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Lock, Notebook, Page, Section, Tombstone } from '../types'
import type { SyncConfig } from './config'
import type { Changeset } from './merge'
import { AuthError, readableAuthError, type Account, type Remote } from './remote'

/**
 * Le serveur réel. Volontairement mince : il ne fait que traduire entre les
 * objets de l'application et les colonnes Postgres, plus l'authentification.
 * Toute la logique de synchronisation vit dans `engine.ts`, qui ne connaît
 * que l'interface `Remote` — et qui est donc testable sans réseau.
 */
export function supabaseRemote(config: SyncConfig): Remote {
  const client: SupabaseClient = createClient(config.url, config.anonKey, {
    auth: {
      // La session est conservée d'un lancement à l'autre, et rafraîchie
      // toute seule : on ne redemande pas le mot de passe à chaque ouverture.
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  const account = (user: { id: string; email?: string } | null | undefined): Account | null =>
    user ? { id: user.id, email: user.email ?? '' } : null

  const failed: (message: string) => never = (message) => {
    throw new AuthError(readableAuthError(message))
  }

  return {
    async currentAccount() {
      const { data } = await client.auth.getSession()
      return account(data.session?.user)
    },

    onAccountChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(account(session?.user))
      })
      return () => data.subscription.unsubscribe()
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password })
      if (error) failed(error.message)
      const created = account(data.user)
      // Sans session, c'est que la confirmation par courriel est exigée.
      if (!created || !data.session) {
        throw new AuthError(
          'Compte créé. Confirmez votre adresse par le courriel reçu, puis connectez-vous.',
        )
      }
      return created
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error) failed(error.message)
      const signed = account(data.user)
      if (!signed) failed('Connexion impossible.')
      return signed
    },

    async signOut() {
      await client.auth.signOut()
    },

    onRemoteChange(listener) {
      // Un seul canal pour les cinq tables : on ne veut qu'un signal, pas le
      // détail de ce qui a bougé.
      const channel = client.channel('folio-changes')
      for (const table of ['notebooks', 'sections', 'pages', 'locks', 'tombstones']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => listener())
      }
      void channel.subscribe()
      return () => void client.removeChannel(channel)
    },

    async pull(since: number): Promise<Changeset> {
      const [notebooks, sections, pages, locks, tombstones] = await Promise.all([
        rows(client, 'notebooks', 'updated_at', since),
        rows(client, 'sections', 'updated_at', since),
        rows(client, 'pages', 'updated_at', since),
        rows(client, 'locks', 'updated_at', since),
        rows(client, 'tombstones', 'deleted_at', since),
      ])
      return {
        notebooks: notebooks.map(toNotebook),
        sections: sections.map(toSection),
        pages: pages.map(toPage),
        locks: locks.map(toLock),
        tombstones: tombstones.map(toTombstone),
      }
    },

    async push(changes: Changeset): Promise<void> {
      const { data } = await client.auth.getUser()
      const userId = data.user?.id
      if (!userId) throw new AuthError('Session expirée : reconnectez-vous.')

      // `upsert` plutôt qu'`insert` : renvoyer deux fois la même modification
      // — après une coupure, par exemple — ne doit pas échouer.
      await Promise.all([
        write(client, 'notebooks', changes.notebooks.map((n) => fromNotebook(n, userId))),
        write(client, 'sections', changes.sections.map((s) => fromSection(s, userId))),
        write(client, 'pages', changes.pages.map((p) => fromPage(p, userId))),
        write(client, 'locks', changes.locks.map((l) => fromLock(l, userId))),
        write(
          client,
          'tombstones',
          changes.tombstones.map((t) => ({
            id: t.id,
            user_id: userId,
            kind: t.kind,
            deleted_at: t.deletedAt,
          })),
        ),
      ])
    },
  }
}

type Row = Record<string, unknown>

async function rows(
  client: SupabaseClient,
  table: string,
  dateColumn: string,
  since: number,
): Promise<Row[]> {
  const { data, error } = await client.from(table).select('*').gt(dateColumn, since)
  if (error) throw new Error(`Lecture de ${table} : ${error.message}`)
  return data ?? []
}

async function write(client: SupabaseClient, table: string, values: Row[]): Promise<void> {
  if (values.length === 0) return
  const { error } = await client.from(table).upsert(values)
  if (error) throw new Error(`Écriture de ${table} : ${error.message}`)
}

// ----- Traductions, colonne par colonne -----

const toNotebook = (r: Row): Notebook => ({
  id: r.id as string,
  name: r.name as string,
  color: r.color as string,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
})

const fromNotebook = (n: Notebook, userId: string): Row => ({
  id: n.id,
  user_id: userId,
  name: n.name,
  color: n.color,
  created_at: n.createdAt,
  updated_at: n.updatedAt,
})

const toSection = (r: Row): Section => ({
  id: r.id as string,
  notebookId: r.notebook_id as string,
  name: r.name as string,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
})

const fromSection = (s: Section, userId: string): Row => ({
  id: s.id,
  user_id: userId,
  notebook_id: s.notebookId,
  name: s.name,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
})

const toPage = (r: Row): Page => ({
  id: r.id as string,
  sectionId: r.section_id as string,
  title: (r.title as string) ?? '',
  html: (r.html as string) ?? '',
  text: (r.text as string) ?? '',
  cipher: (r.cipher as string | null) ?? null,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
})

const fromPage = (p: Page, userId: string): Row => ({
  id: p.id,
  user_id: userId,
  section_id: p.sectionId,
  title: p.title,
  html: p.html,
  text: p.text,
  // Une page protégée part chiffrée : le serveur ne voit ni son titre ni son
  // contenu, seulement `cipher`.
  cipher: p.cipher,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
})

const toLock = (r: Row): Lock => ({
  id: r.id as string,
  scope: r.scope as Lock['scope'],
  salt: r.salt as string,
  iterations: Number(r.iterations),
  verifier: r.verifier as string,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
})

const fromLock = (l: Lock, userId: string): Row => ({
  id: l.id,
  user_id: userId,
  scope: l.scope,
  salt: l.salt,
  iterations: l.iterations,
  verifier: l.verifier,
  created_at: l.createdAt,
  updated_at: l.updatedAt,
})

const toTombstone = (r: Row): Tombstone => ({
  id: r.id as string,
  kind: r.kind as Tombstone['kind'],
  deletedAt: Number(r.deleted_at),
})
