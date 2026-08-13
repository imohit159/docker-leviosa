import { Router } from 'express';
import { VolumeSubPath } from '@leviosa/shared';
import { VOLUME_NAME_PARAM, VolumeController } from '../controllers/index.controllers.js';

const volumeRouter = Router();
const BY_NAME = `/:${VOLUME_NAME_PARAM}`;

/**
 * One collection endpoint carries every filter as a query parameter. There are no
 * `/orphaned` or `/by-project` variants: those are views of the same resource, and
 * minting a route per filter is how an API surface doubles for no new capability.
 */
volumeRouter.get('/', VolumeController.list);
volumeRouter.get(BY_NAME, VolumeController.detail);
volumeRouter.get(`${BY_NAME}/${VolumeSubPath.ENTRIES}`, VolumeController.entries);
volumeRouter.get(`${BY_NAME}/${VolumeSubPath.GROWTH}`, VolumeController.growth);

/** A scan is a resource that gets created, hence POST to a sub-collection. */
volumeRouter.post(`${BY_NAME}/${VolumeSubPath.SCANS}`, VolumeController.scan);

volumeRouter.delete(BY_NAME, VolumeController.remove);

export { volumeRouter };
