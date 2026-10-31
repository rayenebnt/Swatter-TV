import * as migration_20261021_172038_initiale from './20261021_172038_initiale';
import * as migration_20261021_213621_mesure_audience from './20261021_213621_mesure_audience';
import * as migration_20261023_165354_nom_swatter_tv_info from './20261023_165354_nom_swatter_tv_info';
import * as migration_20261027_123813_mention_protection from './20261027_123813_mention_protection';
import * as migration_20261030_115356_apercu_video_image_mobile from './20261030_115356_apercu_video_image_mobile';
import * as migration_20261030_225851_autres_regions_info from './20261030_225851_autres_regions_info';

export const migrations = [
  {
    up: migration_20261021_172038_initiale.up,
    down: migration_20261021_172038_initiale.down,
    name: '20261021_172038_initiale',
  },
  {
    up: migration_20261021_213621_mesure_audience.up,
    down: migration_20261021_213621_mesure_audience.down,
    name: '20261021_213621_mesure_audience',
  },
  {
    up: migration_20261023_165354_nom_swatter_tv_info.up,
    down: migration_20261023_165354_nom_swatter_tv_info.down,
    name: '20261023_165354_nom_swatter_tv_info',
  },
  {
    up: migration_20261027_123813_mention_protection.up,
    down: migration_20261027_123813_mention_protection.down,
    name: '20261027_123813_mention_protection',
  },
  {
    up: migration_20261030_115356_apercu_video_image_mobile.up,
    down: migration_20261030_115356_apercu_video_image_mobile.down,
    name: '20261030_115356_apercu_video_image_mobile',
  },
  {
    up: migration_20261030_225851_autres_regions_info.up,
    down: migration_20261030_225851_autres_regions_info.down,
    name: '20261030_225851_autres_regions_info'
  },
];
