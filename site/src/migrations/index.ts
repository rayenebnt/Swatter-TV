import * as migration_20261021_172038_initiale from './20261021_172038_initiale';
import * as migration_20261021_213621_mesure_audience from './20261021_213621_mesure_audience';

export const migrations = [
  {
    up: migration_20261021_172038_initiale.up,
    down: migration_20261021_172038_initiale.down,
    name: '20261021_172038_initiale',
  },
  {
    up: migration_20261021_213621_mesure_audience.up,
    down: migration_20261021_213621_mesure_audience.down,
    name: '20261021_213621_mesure_audience'
  },
];
