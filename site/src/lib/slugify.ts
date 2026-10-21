/** « Le Lac d'Annecy vu du ciel » → « le-lac-d-annecy-vu-du-ciel » */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // ligatures que la décomposition NFD laisse intactes : « Cœur » → « coeur », pas « c-ur »
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
    // la coupure à 96 caractères peut tomber juste après un tiret
    .replace(/-+$/, '')
}
