import type { Request } from 'express';
import { HttpStatus } from '../config/index.config.js';
import { HOST_ID_PARAM } from '../middlewares/index.middlewares.js';
import { HostService } from '../services/index.services.js';
import { ApiErrors, ApiResponse, AsyncHandler } from '../utils/index.utils.js';
import { HostValidation } from '../validations/index.validations.js';

function _hostId(req: Request): string {
  return HostValidation.hostId(req.params[HOST_ID_PARAM]);
}

/**
 * HTTP edge for the host registry.
 *
 * Note there is no route that accepts key material: `HostValidation` rejects any such
 * field outright, so the only way to authenticate is a key path or the SSH agent.
 */
export const HostController = Object.freeze({
  /** GET /api/v1/hosts */
  list: AsyncHandler.wrap(async (_req, res) => {
    try {
      return ApiResponse.ok(res, HostService.list());
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'listing hosts');
    }
  }),

  /** GET /api/v1/hosts/:hostId */
  detail: AsyncHandler.wrap(async (req, res) => {
    try {
      return ApiResponse.ok(res, HostService.find(_hostId(req)));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'loading a host');
    }
  }),

  /** POST /api/v1/hosts */
  create: AsyncHandler.wrap(async (req, res) => {
    try {
      const input = HostValidation.create(req.body);
      return ApiResponse.send(res, HttpStatus.CREATED, HostService.create(input));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'registering a host');
    }
  }),

  /** PATCH /api/v1/hosts/:hostId */
  update: AsyncHandler.wrap(async (req, res) => {
    try {
      const patch = HostValidation.update(req.body);
      return ApiResponse.ok(res, HostService.update(_hostId(req), patch));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'updating a host');
    }
  }),

  /** DELETE /api/v1/hosts/:hostId */
  remove: AsyncHandler.wrap(async (req, res) => {
    try {
      const hostId = _hostId(req);
      HostService.remove(hostId);
      return ApiResponse.ok(res, { id: hostId, deleted: true });
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'removing a host');
    }
  }),

  /**
   * POST /api/v1/hosts/:hostId/test
   *
   * Always 200 with a structured outcome, even when the connection fails: the failure
   * is the answer the caller asked for, not an error in serving the request.
   */
  test: AsyncHandler.wrap(async (req, res) => {
    try {
      return ApiResponse.ok(res, await HostService.test(_hostId(req)));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'testing a host connection');
    }
  }),

  /** POST /api/v1/hosts/:hostId/trust */
  trust: AsyncHandler.wrap(async (req, res) => {
    try {
      const { fingerprint } = HostValidation.trust(req.body);
      return ApiResponse.ok(res, HostService.trust(_hostId(req), fingerprint));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'trusting a host key');
    }
  }),
});
