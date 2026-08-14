import type { Request } from 'express';
import { HttpStatus } from '../config/index.config.js';
import { HostMiddleware } from '../middlewares/index.middlewares.js';
import { ScanQueue } from '../queue/index.queue.js';
import { BrowseService, VolumeService } from '../services/index.services.js';
import { ApiErrors, ApiResponse, AsyncHandler } from '../utils/index.utils.js';
import { VolumeValidation } from '../validations/index.validations.js';

/** Route parameter name, declared once and reused by the router and handlers. */
export const VOLUME_NAME_PARAM = 'name';

function _volumeName(req: Request): string {
  return VolumeValidation.volumeName(req.params[VOLUME_NAME_PARAM]);
}

/**
 * HTTP edge for volume resources. Controllers only validate, delegate and envelope —
 * no branching on domain rules, which all live in the services.
 *
 * Each handler carries its own try/catch even though `AsyncHandler` already routes
 * rejections: it guarantees that anything escaping a service is annotated with the
 * operation that produced it before it reaches the error middleware.
 */
export const VolumeController = Object.freeze({
  /** GET /api/v1/hosts/:hostId/volumes?search=&usage=&project=&sort=&order=&limit=&offset= */
  list: AsyncHandler.wrap(async (req, res) => {
    try {
      const host = HostMiddleware.require(req);
      const query = VolumeValidation.listQuery(req.query);
      return ApiResponse.paginated(res, await VolumeService.list(host, query));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'listing volumes');
    }
  }),

  /** GET /api/v1/hosts/:hostId/volumes/:name?days= */
  detail: AsyncHandler.wrap(async (req, res) => {
    try {
      const host = HostMiddleware.require(req);
      const name = _volumeName(req);
      const { days } = VolumeValidation.growthQuery(req.query);
      return ApiResponse.ok(res, await VolumeService.detail(host, name, days));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'loading volume detail');
    }
  }),

  /** GET /api/v1/hosts/:hostId/volumes/:name/entries?path= */
  entries: AsyncHandler.wrap(async (req, res) => {
    try {
      const host = HostMiddleware.require(req);
      const name = _volumeName(req);
      const { path } = VolumeValidation.browseQuery(req.query);
      return ApiResponse.ok(res, await BrowseService.list(host, name, path));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'listing volume contents');
    }
  }),

  /** GET /api/v1/hosts/:hostId/volumes/:name/growth?days= */
  growth: AsyncHandler.wrap(async (req, res) => {
    try {
      const host = HostMiddleware.require(req);
      const name = _volumeName(req);
      const { days } = VolumeValidation.growthQuery(req.query);
      return ApiResponse.ok(res, await VolumeService.growth(host, name, days));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'loading growth history');
    }
  }),

  /**
   * POST /api/v1/hosts/:hostId/volumes/:name/scans
   *
   * Returns 202 with a job handle rather than blocking: measuring a large volume is a
   * full tree walk that can run for minutes, and an HTTP request is the wrong place to
   * hold that open.
   */
  scan: AsyncHandler.wrap(async (req, res) => {
    try {
      const host = HostMiddleware.require(req);
      const name = _volumeName(req);
      return ApiResponse.send(res, HttpStatus.ACCEPTED, ScanQueue.enqueue(host, name));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'queueing a volume scan');
    }
  }),

  /** DELETE /api/v1/hosts/:hostId/volumes/:name?confirm= */
  remove: AsyncHandler.wrap(async (req, res) => {
    try {
      const host = HostMiddleware.require(req);
      const name = _volumeName(req);
      const { confirm } = VolumeValidation.deleteQuery(req.query);
      return ApiResponse.ok(res, await VolumeService.remove(host, name, confirm));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'removing a volume');
    }
  }),
});
