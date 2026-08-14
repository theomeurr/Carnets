import { describe, expect, it } from 'vitest'
import { fakeRemote } from './fake'
import { nameOf, type Account } from './remote'

const compte = (patch: Partial<Account> = {}): Account => ({
  id: 'a',
  email: 'jeanne.dupont@exemple.fr',
  firstName: 'Jeanne',
  lastName: 'Dupont',
  ...patch,
})

describe('nom affiché', () => {
  it('donne le prénom en court et l’identité entière en long', () => {
    expect(nameOf(compte())).toEqual({ short: 'Jeanne', full: 'Jeanne Dupont' })
  })

  it('retombe sur l’adresse pour un compte sans identité', () => {
    // Les comptes créés avant que Folio ne demande le prénom : l'affichage ne
    // doit jamais rendre une chaîne vide.
    const ancien = compte({ firstName: '', lastName: '' })
    expect(nameOf(ancien)).toEqual({ short: 'jeanne.dupont', full: 'jeanne.dupont' })
  })

  it('se contente du prénom quand le nom manque', () => {
    expect(nameOf(compte({ lastName: '' }))).toEqual({ short: 'Jeanne', full: 'Jeanne' })
  })
})

describe('inscription', () => {
  it('retient l’identité et la rend à la connexion suivante', async () => {
    const remote = fakeRemote()

    const inscrit = await remote.signUp('jeanne@exemple.fr', 'motdepasse', {
      firstName: 'Jeanne',
      lastName: 'Dupont',
    })
    expect(inscrit).toMatchObject({ firstName: 'Jeanne', lastName: 'Dupont' })

    // Le prénom ne se redemande pas : il revient du compte, comme les
    // métadonnées du vrai serveur.
    await remote.signOut()
    const revenu = await remote.signIn('jeanne@exemple.fr', 'motdepasse')
    expect(revenu).toMatchObject({ firstName: 'Jeanne', lastName: 'Dupont' })
  })

  it('laisse l’identité vide pour un compte qu’elle ne connaît pas', async () => {
    const remote = fakeRemote()
    const inconnu = await remote.signIn('ancien@exemple.fr', 'motdepasse')
    expect(inconnu).toMatchObject({ firstName: '', lastName: '' })
    // Et l'affichage reste tenable malgré tout.
    expect(nameOf(inconnu).short).toBe('ancien')
  })

  it('prévient l’application du changement de compte', async () => {
    const remote = fakeRemote()
    const vus: (Account | null)[] = []
    remote.onAccountChange((account) => vus.push(account))

    await remote.signUp('jeanne@exemple.fr', 'motdepasse', {
      firstName: 'Jeanne',
      lastName: 'Dupont',
    })
    await remote.signOut()

    expect(vus).toHaveLength(2)
    expect(vus[0]).toMatchObject({ firstName: 'Jeanne' })
    expect(vus[1]).toBeNull()
  })
})
