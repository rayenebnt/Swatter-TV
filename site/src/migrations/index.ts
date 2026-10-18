import * as migration_20261018_182012_initiale from './20261018_182012_initiale';

export const migrations = [
  {
    up: migration_20261018_182012_initiale.up,
    down: migration_20261018_182012_initiale.down,
    name: '20261018_182012_initiale'
  },
];
