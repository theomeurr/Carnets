/**
 * Où joindre le serveur de synchronisation.
 *
 * La clé « anon » est **publique par construction** : elle part dans le
 * paquet JavaScript, que n'importe quel visiteur peut lire. Elle n'ouvre
 * rien par elle-même — c'est la sécurité par ligne, côté Postgres, qui fait
 * le travail : sans être authentifié, une requête ne rend aucune ligne, et
 * une fois authentifié elle ne rend que les siennes.
 *
 * La clé `service_role`, elle, contourne tout cela : elle n'a rien à faire
 * ici, ni dans aucun code qui atteint un navigateur.
 *
 * Les variables d'environnement permettent de viser un autre projet — un
 * bac à sable, par exemple — sans toucher au code.
 */

const DEFAULT_URL = 'https://qykzxoxloqbspdwdzdqj.supabase.co'
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5a3p4b3hsb3Fic3Bkd2R6ZHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2ODQ2NjksImV4cCI6MjEwMjI2MDY2OX0.fimA2t860B4a_vE73opETp8wCNxzUaSL05-AdzgkH0s'

export interface SyncConfig {
  url: string
  anonKey: string
}

/**
 * La configuration, ou `null` si elle est absente. Dans ce cas l'application
 * tourne exactement comme avant : entièrement locale, sans compte, sans
 * réseau. La synchronisation est un ajout, jamais un prérequis.
 */
export function syncConfig(): SyncConfig | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? DEFAULT_URL
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? DEFAULT_ANON_KEY
  if (!url || !anonKey) return null
  // L'adresse du projet, pas celle de l'API REST : le client ajoute lui-même
  // le chemin. Coller « …/rest/v1/ » est l'erreur classique, on la rattrape.
  return { url: url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), anonKey }
}
