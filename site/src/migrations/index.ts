import * as migration_20261021_172038_initiale from './20261021_172038_initiale';

export const migrations = [
  {
    up: migration_20261021_172038_initiale.up,
    down: migration_20261021_172038_initiale.down,
    name: '20261021_172038_initiale'
  },
];
