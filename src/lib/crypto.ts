/**
 * Le chiffrement des notes verrouillées, sur les primitives du navigateur
 * (WebCrypto) — aucune bibliothèque tierce ne voit passer les mots de passe.
 *
 * Le mot de passe n'est jamais enregistré, nulle part : il sert à dériver une
 * clé (PBKDF2) qui ne vit qu'en mémoire, le temps de la session. Ce qui est
 * écrit sur le disque, ce sont uniquement le sel, le nombre d'itérations et
 * les données chiffrées.
 */

/**
 * Coût de la dérivation. La recommandation OWASP pour PBKDF2-HMAC-SHA256 est
 * de 600 000 itérations : assez lent pour rendre une attaque par dictionnaire
 * coûteuse, assez rapide pour un déverrouillage (quelques centaines de ms).
 * Le nombre est enregistré avec chaque verrou, pour pouvoir l'augmenter plus
 * tard sans rendre les anciennes notes illisibles.
 */
export const PBKDF2_ITERATIONS = 600_000

const SALT_BYTES = 16
/** AES-GCM veut un vecteur d'initialisation de 96 bits. */
const IV_BYTES = 12

/**
 * Texte témoin chiffré à la pose du verrou, pour vérifier un mot de passe.
 *
 * À ne jamais modifier — le renommage de l'application compris. Ce texte est
 * chiffré à l'intérieur de chaque verrou déjà posé ; le changer ferait échouer
 * la comparaison, et **tous les mots de passe existants seraient rejetés**.
 */
const VERIFIER_PLAINTEXT = 'carnets:verrou:v1'

export class CryptoUnavailableError extends Error {
  constructor() {
    super(
      'Le chiffrement n’est pas disponible : cette page doit être servie en HTTPS ou depuis localhost.',
    )
    this.name = 'CryptoUnavailableError'
  }
}

/** Levée quand le déchiffrement échoue — mot de passe faux, ou données altérées. */
export class WrongPasswordError extends Error {
  constructor() {
    super('Mot de passe incorrect.')
    this.name = 'WrongPasswordError'
  }
}

function subtle(): SubtleCrypto {
  // `crypto.subtle` n'existe que dans un contexte sécurisé (HTTPS ou localhost).
  if (!globalThis.crypto?.subtle) throw new CryptoUnavailableError()
  return globalThis.crypto.subtle
}

// Le paramètre `ArrayBuffer` explicite : sans lui, TypeScript autorise un
// `SharedArrayBuffer` sous-jacent, que WebCrypto refuse.
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export function newSalt(): string {
  return toBase64(randomBytes(SALT_BYTES))
}

/**
 * Dérive la clé de chiffrement à partir du mot de passe et du sel. Le sel est
 * propre à chaque verrou : deux notes protégées par le même mot de passe ne
 * donnent pas la même clé, et une table pré-calculée ne sert à rien.
 */
export async function deriveKey(
  password: string,
  salt: string,
  iterations: number,
): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return subtle().deriveKey(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    // Non exportable : la clé ne peut pas être relue depuis le code appelant.
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Chiffre un texte. Le vecteur d'initialisation est tiré au hasard **à chaque
 * appel** — le réutiliser avec la même clé casserait AES-GCM — puis rangé en
 * tête du résultat, car il est nécessaire au déchiffrement et n'est pas secret.
 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = randomBytes(IV_BYTES)
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )

  const packed = new Uint8Array(new ArrayBuffer(iv.length + ciphertext.byteLength))
  packed.set(iv, 0)
  packed.set(new Uint8Array(ciphertext), iv.length)
  return toBase64(packed)
}

/**
 * Déchiffre. AES-GCM authentifie les données : une clé fausse ou un contenu
 * modifié fait échouer l'opération au lieu de rendre n'importe quoi — c'est
 * ce qui permet de vérifier un mot de passe sans en stocker d'empreinte.
 */
export async function decrypt(key: CryptoKey, packed: string): Promise<string> {
  const bytes = fromBase64(packed)
  const iv = bytes.slice(0, IV_BYTES)
  const ciphertext = bytes.slice(IV_BYTES)

  try {
    const plaintext = await subtle().decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new WrongPasswordError()
  }
}

/** Le témoin enregistré avec le verrou, qui servira à valider un mot de passe. */
export function makeVerifier(key: CryptoKey): Promise<string> {
  return encrypt(key, VERIFIER_PLAINTEXT)
}

/** Vrai si la clé ouvre bien ce verrou. */
export async function checkVerifier(key: CryptoKey, verifier: string): Promise<boolean> {
  try {
    return (await decrypt(key, verifier)) === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
