// Frise « Notre logo au fil du temps » de la page « Le groupe » : les cinq logos successifs de la chaîne, en un an, du
// plus ancien au plus récent (fichiers : seed/assets/logos, mis au carré sur leur fond d'origine ; médias : media.ts),
// première frise de la page dans les contenus de départ (seed.ts). Elle se modifie ensuite dans l'administration
// (Pages › Le groupe › Frises chronologiques) : dates, textes, ordre.

/** Adresse de la page qui porte la frise. */
export const LOGO_PAGE = 'le-groupe'

export const LOGO_TIMELINE = {
  title: 'Notre logo au fil du temps',
  intro: 'En un an, le logo de Swatter TV Info a connu cinq versions. Les voici, de la plus ancienne à la plus récente.',
  steps: [
    { media: 'logo-1-hd', title: 'Swatter TV HD', text: 'Le tout premier logo : un bouton de lecture doré marqué « HD ».' },
    { media: 'logo-2-triangle', title: 'Le triangle jaune', text: 'Le nom s’affiche en grandes lettres blanches dans un triangle jaune.' },
    { media: 'logo-3-info', title: 'Swatter TV Info', text: 'La chaîne devient Swatter TV Info : la mention « Info » se glisse entre le T et le V.' },
    { media: 'logo-4-contour', title: 'Le triangle doré', text: 'Le triangle s’affine en un contour doré, sur fond noir.' },
    { media: 'logo-5-montagnes', title: 'Le logo d’aujourd’hui', text: 'Les montagnes entrent dans le triangle : c’est le logo actuel de la chaîne.' },
  ],
}

/** Frise des logos, en données Payload : chaque logo par son numéro dans la médiathèque. */
export const logoTimelineData = (mediaId: (key: string) => number) => ({
  title: LOGO_TIMELINE.title,
  intro: LOGO_TIMELINE.intro,
  steps: LOGO_TIMELINE.steps.map((s) => ({ title: s.title, text: s.text, image: mediaId(s.media) })),
})
