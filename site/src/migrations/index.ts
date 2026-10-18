import * as migration_20261018_213019_initiale from './20261018_213019_initiale';

export const migrations = [
  {
    up: migration_20261018_213019_initiale.up,
    down: migration_20261018_213019_initiale.down,
    name: '20261018_213019_initiale'
  },
];
