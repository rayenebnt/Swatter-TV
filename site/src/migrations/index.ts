import * as migration_20261018_020546_initiale from './20261018_020546_initiale';

export const migrations = [
  {
    up: migration_20261018_020546_initiale.up,
    down: migration_20261018_020546_initiale.down,
    name: '20261018_020546_initiale'
  },
];
