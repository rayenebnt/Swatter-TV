// Outils partagés par les tests des chemins de redirection (safeReturn de l'espace membres, safePath de l'aperçu) :
// tentatives de sortie du site et lecture d'une adresse comme le ferait un navigateur.

export const SITE = 'https://www.swatter-tv.fr'

/** Adresse où irait le navigateur avec cette valeur dans l'en-tête Location (analyseur WHATWG, celui des navigateurs). */
export const landing = (path: string) => new URL(path, SITE)

/** Texte ASCII imprimable, sans espace : rien à réencoder dans un en-tête Location. */
export const ASCII_HEADER = /^[\x21-\x7e]+$/

/** Préfixes qui déguisent une adresse extérieure (barres, barre inverse, tabulation, points, encodages, protocoles). */
export const PREFIXES = [
  '',
  '/',
  '//',
  '///',
  '/\\',
  '\\/',
  '\\\\',
  '/\t/',
  '/\n/',
  '/\r/',
  '/ /',
  '/%09/',
  '/%2f',
  '/%5c',
  '/./',
  '/.//',
  '/../',
  '/..//',
  '/a/..//',
  '/a/b/../..//',
  '/%2e%2e//',
  '/.%2e//',
  '/%2e//',
  '/%2E%2E//',
  ' //',
  '\t//',
  'http:',
  'https:',
  'HTTPS://',
  '//\\',
  '/\u3002/',
  '/\uff0f',
  'javascript:',
]

/** Destinations : un autre site (avec identifiants, port…) ou une rubrique réservée. */
export const TARGETS = [
  'evil.example',
  'evil.example/compte',
  '@evil.example',
  'user:pass@evil.example',
  'evil.example:443',
  'admin',
  'api/compte/moi',
  '%2e%2e/admin',
  'apercu?chemin=//evil.example',
]

export const ATTACKS = PREFIXES.flatMap((p) => TARGETS.map((t) => `${p}${t}`))

/** Adresses extérieures déguisées, toutes à refuser. */
export const EXTERNAL = [
  '//evil.example',
  '//evil.example/compte',
  '/\\evil.example',
  '\\\\evil.example',
  '/\t/evil.example',
  '/\n/evil.example',
  '/\r\n/evil.example',
  '/.//evil.example',
  '/a/..//evil.example',
  '/a/b/../..//evil.example',
  '/../..//evil.example',
  '/%2e%2e//evil.example',
  '/.%2e//evil.example',
  '/%2E//evil.example',
  'https://evil.example',
  'HTTPS://evil.example',
  'http:/evil.example',
  'http:evil.example',
  'javascript:alert(1)',
  'evil.example',
  ' //evil.example',
]
