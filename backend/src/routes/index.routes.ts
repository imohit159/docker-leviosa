import { Router } from 'express';
import { API_PREFIX, ResourcePath } from '@leviosa/shared';
import { JOB_ID_PARAM, JobController, SystemController } from '../controllers/index.controllers.js';
import { HostMiddleware } from '../middlewares/index.middlewares.js';
import { hostRouter } from './host.routes.js';
import { volumeRouter } from './volume.routes.js';

/**
 * Mounts every resource under the versioned prefix. Path segments come from the shared
 * contract, so the client cannot drift from the server on a URL.
 */
export const ApiRouter = Object.freeze({
  build(): Router {
    const api = Router();

    api.get(ResourcePath.HEALTH, SystemController.health);
    api.get(`${ResourcePath.JOBS}/:${JOB_ID_PARAM}`, JobController.detail);
    api.use(ResourcePath.HOSTS, hostRouter);

    /*
     * Pre-multi-host paths, kept as aliases pinned to the local daemon.
     *
     * They exist so an upgrade does not break a running client mid-deploy. They are not
     * a second way to address hosts: there is no way to reach a remote through them,
     * which is why the resolver here is hard-wired rather than reading a parameter.
     */
    const localAlias = Router();
    localAlias.use(HostMiddleware.localAlias());
    localAlias.get(`${ResourcePath.SYSTEM}/summary`, SystemController.summary);
    localAlias.use(ResourcePath.VOLUMES, volumeRouter);
    api.use(localAlias);

    const root = Router();
    root.use(API_PREFIX, api);
    return root;
  },
});
