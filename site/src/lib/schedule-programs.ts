// Émissions pas en ligne dans la grille des programmes (logique pure, partagée par la collection, le tableau de bord et
// l'outil de la liste). Une émission créée dans l'administration (« Ajouter », puis saisie enregistrée automatiquement)
// n'a pas de version publiée tant qu'on n'a pas cliqué sur « Publier les modifications » : sa fiche en ligne est vide, et
// le site affiche ses créneaux sans son nom, sous le titre « Programme ». Un créneau n'est donc publié qu'avec une
// émission en ligne (src/collections/Schedule.ts : refus aussi pour une émission retirée du site) ; la grille et le
// tableau de bord signalent les émissions jamais publiées de créneaux déjà publiés, pour les publier d'un clic.

/** Refus d'un créneau à la publication : son émission n'est pas en ligne (message affiché sous le champ « Émission »). */
export function offlineProgramMessage(title?: string | null): string {
  return `${title ? `« ${title} »` : 'Cette émission'} n’est pas en ligne : ouvrez-la (Programme TV › Émissions) et cliquez sur « Publier les modifications », puis publiez ce créneau (une émission doit être publiée pour apparaître dans le programme du site).`
}

/** Numéro de l'émission d'un créneau : relation non peuplée (nombre) ou peuplée (objet) ; null sans émission. */
export function programIdOf(program: unknown): number | null {
  const id = program && typeof program === 'object' ? (program as { id?: unknown }).id : program
  return typeof id === 'number' && Number.isFinite(id) ? id : null
}

/** Nom d'une émission dans un message : « « Le journal » », ou son numéro si elle n'a pas encore de titre. */
export const programName = (p: { id: number | string; title?: string | null }) => (p.title ? `« ${p.title} »` : `n° ${p.id} (sans titre)`)
