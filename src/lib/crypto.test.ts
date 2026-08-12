import { describe, expect, it } from 'vitest'
import { checkVerifier, decrypt, deriveKey, encrypt, makeVerifier, newSalt } from './crypto'

// Un coût réduit : ces tests vérifient le comportement, pas la lenteur voulue
// en production. Le vrai nombre d'itérations est enregistré avec chaque verrou.
const FAST = 1_000

describe('chiffrement', () => {
  it('retrouve le texte d’origine', async () => {
    const key = await deriveKey('secret', newSalt(), FAST)
    const clair = 'Bilan du 12 mars — tension normale.'
    expect(await decrypt(key, await encrypt(key, clair))).toBe(clair)
  })

  it('produit un chiffré différent à chaque fois pour le même texte', async () => {
    const key = await deriveKey('secret', newSalt(), FAST)
    // Vecteur d'initialisation tiré au hasard : deux chiffrés identiques
    // trahiraient une réutilisation, qui casserait AES-GCM.
    expect(await encrypt(key, 'même texte')).not.toBe(await encrypt(key, 'même texte'))
  })

  it('refuse de déchiffrer avec un autre mot de passe', async () => {
    const salt = newSalt()
    const bonne = await deriveKey('bon', salt, FAST)
    const mauvaise = await deriveKey('mauvais', salt, FAST)
    const scellé = await encrypt(bonne, 'confidentiel')
    await expect(decrypt(mauvaise, scellé)).rejects.toThrow('Mot de passe incorrect')
  })

  it('donne des clés différentes pour le même mot de passe avec deux sels', async () => {
    const scellé = await encrypt(await deriveKey('identique', newSalt(), FAST), 'texte')
    const autre = await deriveKey('identique', newSalt(), FAST)
    await expect(decrypt(autre, scellé)).rejects.toThrow()
  })

  it('détecte un chiffré altéré', async () => {
    const key = await deriveKey('secret', newSalt(), FAST)
    const scellé = await encrypt(key, 'intègre')
    // On retouche un caractère du chiffré : l'authentification doit le voir.
    const abîmé = scellé.slice(0, -6) + (scellé.at(-6) === 'A' ? 'B' : 'A') + scellé.slice(-5)
    await expect(decrypt(key, abîmé)).rejects.toThrow()
  })

  it('conserve les accents et les caractères hors ASCII', async () => {
    const key = await deriveKey('secret', newSalt(), FAST)
    const clair = 'Élève — « déjà vu » 日本語 🔒'
    expect(await decrypt(key, await encrypt(key, clair))).toBe(clair)
  })
})

describe('témoin de mot de passe', () => {
  it('reconnaît la bonne clé', async () => {
    const salt = newSalt()
    const key = await deriveKey('bon', salt, FAST)
    const verifier = await makeVerifier(key)
    expect(await checkVerifier(await deriveKey('bon', salt, FAST), verifier)).toBe(true)
  })

  it('rejette la mauvaise, sans lever d’exception', async () => {
    const salt = newSalt()
    const verifier = await makeVerifier(await deriveKey('bon', salt, FAST))
    expect(await checkVerifier(await deriveKey('mauvais', salt, FAST), verifier)).toBe(false)
  })
})
