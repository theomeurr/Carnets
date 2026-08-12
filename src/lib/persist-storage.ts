/**
 * Demande au navigateur de ne pas évincer les données du site quand l'espace
 * vient à manquer. Sans cette demande, IndexedDB fait partie de ce qu'un
 * navigateur peut effacer de lui-même — et ici, ce sont toutes les notes.
 *
 * Une application installée obtient généralement l'autorisation sans rien
 * demander à personne. Un refus n'est pas grave : l'application fonctionne
 * exactement pareil, avec un risque d'éviction en cas de disque saturé.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
