import type { Changeset } from './merge'

/** Qui est connecté, vu de l'application. */
export interface Account {
  id: string
  email: string
}

/**
 * Le serveur, vu par le moteur de synchronisation. Cette interface existe
 * pour que la logique — celle qui décide quoi envoyer et comment fusionner —
 * soit vérifiable sans réseau : les tests branchent un serveur en mémoire à
 * la place de Supabase, et exercent exactement le même code.
 */
export interface Remote {
  /** Le compte connecté, ou `null`. */
  currentAccount(): Promise<Account | null>
  /** Prévient à chaque connexion ou déconnexion. Rend de quoi se désabonner. */
  onAccountChange(listener: (account: Account | null) => void): () => void

  signUp(email: string, password: string): Promise<Account>
  signIn(email: string, password: string): Promise<Account>
  signOut(): Promise<void>

  /**
   * Prévient qu'un autre appareil a écrit quelque chose. C'est une simple
   * sonnette : elle ne transporte pas les données, elle déclenche un tour de
   * synchronisation ordinaire. La fusion garde ainsi un chemin unique, au lieu
   * d'un second par lequel les défauts pourraient se glisser.
   *
   * Facultatif : sans elle, on retombe sur la vérification périodique.
   */
  onRemoteChange?(listener: () => void): () => void

  /** Tout ce qui a changé côté serveur depuis `since` (millisecondes). */
  pull(since: number): Promise<Changeset>
  /** Envoie les modifications locales. */
  push(changes: Changeset): Promise<void>
}

/** Erreur d'authentification, formulée pour être montrée telle quelle. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Traduit les messages de Supabase, qui arrivent en anglais et parfois
 * cryptiques, en quelque chose de lisible.
 */
export function readableAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Adresse ou mot de passe incorrect.'
  if (lower.includes('user already registered')) return 'Un compte existe déjà pour cette adresse.'
  if (lower.includes('password should be at least')) {
    return 'Le mot de passe doit faire au moins 6 caractères.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Adresse non confirmée : ouvrez le courriel reçu à l’inscription.'
  }
  if (lower.includes('unable to validate email')) return 'Adresse électronique invalide.'
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Serveur injoignable. Vos notes restent enregistrées sur cet appareil.'
  }
  return message
}
