import { Router } from 'express';
import { API_PREFIX, ResourcePath } from '@leviosa/shared';
import { JOB_ID_PARAM, JobController, SystemController } from '../controllers/index.controllers.js';
import { volumeRouter } from './volume.routes.js';

/**
 * Mounts every resource under the versioned prefix. Path segments come from the shared
 * contract, so the client cannot drift from the server on a URL.
 */
export const ApiRouter = Object.freeze({
  build(): Router {
    const api = Router();

    api.get(ResourcePath.HEALTH, SystemController.health);
    api.get(`${ResourcePath.SYSTEM}/summary`, SystemController.summary);
    api.get(`${ResourcePath.JOBS}/:${JOB_ID_PARAM}`, JobController.detail);
    api.use(ResourcePath.VOLUMES, volumeRouter);

    const root = Router();
    root.use(API_PREFIX, api);
    return root;
  },
});
