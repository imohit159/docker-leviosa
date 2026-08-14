import { HttpStatus } from '../config/index.config.js';
import { HostMiddleware } from '../middlewares/index.middlewares.js';
import { SystemService } from '../services/index.services.js';
import { ApiErrors, ApiResponse, AsyncHandler } from '../utils/index.utils.js';

export const SystemController = Object.freeze({
  /** GET /api/v1/hosts/:hostId/system/summary — dashboard headline figures. */
  summary: AsyncHandler.wrap(async (req, res) => {
    try {
      return ApiResponse.ok(res, await SystemService.summary(HostMiddleware.require(req)));
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'building the system summary');
    }
  }),

  /**
   * GET /api/v1/health
   *
   * Answers 503 only when no enabled host answered at all. One unreachable remote
   * leaves this 200 with that host marked offline, because failing the whole endpoint
   * would take the dashboard down for hosts that are working fine.
   */
  health: AsyncHandler.wrap(async (_req, res) => {
    try {
      const report = await SystemService.health();
      const status = report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
      return ApiResponse.send(res, status, report);
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'reporting health');
    }
  }),
});
