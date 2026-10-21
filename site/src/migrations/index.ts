import * as migration_20261021_124823_initiale from './20261021_124823_initiale';

export const migrations = [
  {
    up: migration_20261021_124823_initiale.up,
    down: migration_20261021_124823_initiale.down,
    name: '20261021_124823_initiale'
  },
];
