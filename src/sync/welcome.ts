/**
 * A-t-on déjà demandé à cette personne, sur cet appareil, si elle voulait un
 * compte ?
 *
 * La page de connexion se montre à l'ouverture tant que la question n'a pas
 * été tranchée — se connecter, s'inscrire, ou choisir de rester en local.
 * Ensuite elle ne s'impose plus : on y retourne par le bandeau.
 */
const KEY = 'folio:compte-choisi'

export function choiceMade(): boolean {
  try {
    return localStorage.getItem(KEY) === 'oui'
  } catch {
    // Sans stockage, la réponse ne pourrait pas être retenue et la page
    // reviendrait à chaque ouverture. On considère donc la question réglée :
    // mieux vaut ne pas la poser que la poser sans fin. Le bandeau reste le
    // chemin vers le compte.
    return true
  }
}

export function rememberChoice(): void {
  try {
    localStorage.setItem(KEY, 'oui')
  } catch {
    // Voir ci-dessus : sans stockage, `choiceMade` répond déjà « oui ».
  }
}
