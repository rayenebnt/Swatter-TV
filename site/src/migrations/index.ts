import * as migration_20261018_201007_initiale from './20261018_201007_initiale';

export const migrations = [
  {
    up: migration_20261018_201007_initiale.up,
    down: migration_20261018_201007_initiale.down,
    name: '20261018_201007_initiale'
  },
];
