import * as migration_20261021_142215_initiale from './20261021_142215_initiale';

export const migrations = [
  {
    up: migration_20261021_142215_initiale.up,
    down: migration_20261021_142215_initiale.down,
    name: '20261021_142215_initiale'
  },
];
