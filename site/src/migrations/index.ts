import * as migration_20261018_140322_initiale from './20261018_140322_initiale';

export const migrations = [
  {
    up: migration_20261018_140322_initiale.up,
    down: migration_20261018_140322_initiale.down,
    name: '20261018_140322_initiale'
  },
];
