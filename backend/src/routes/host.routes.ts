import { Router } from 'express';
import { HostSubPath, ResourcePath } from '@leviosa/shared';
import { HostController, SystemController } from '../controllers/index.controllers.js';
import { HOST_ID_PARAM, HostMiddleware } from '../middlewares/index.middlewares.js';
import { volumeRouter } from './volume.routes.js';

const hostRouter = Router();
const BY_ID = `/:${HOST_ID_PARAM}`;

hostRouter.get('/', HostController.list);
hostRouter.post('/', HostController.create);

hostRouter.get(BY_ID, HostController.detail);
hostRouter.patch(BY_ID, HostController.update);
hostRouter.delete(BY_ID, HostController.remove);

hostRouter.post(`${BY_ID}/${HostSubPath.TEST}`, HostController.test);
hostRouter.post(`${BY_ID}/${HostSubPath.TRUST}`, HostController.trust);

/*
 * Everything below is scoped to one host, so the resolver runs first and every handler
 * behind it can rely on the context being present. `mergeParams` is what lets the
 * nested volume router still see `:hostId`.
 */
const scoped = Router({ mergeParams: true });
scoped.use(HostMiddleware.fromParam());
scoped.get(`${ResourcePath.SYSTEM}/summary`, SystemController.summary);
scoped.use(ResourcePath.VOLUMES, volumeRouter);

hostRouter.use(BY_ID, scoped);

export { hostRouter };
