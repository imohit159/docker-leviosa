import { HttpStatus } from '../config/index.config.js';
import { SystemService } from '../services/index.services.js';
import { ApiErrors, ApiResponse, AsyncHandler } from '../utils/index.utils.js';

export const SystemController = Object.freeze({
  /** GET /api/v1/system/summary — dashboard headline figures. */
  summary: AsyncHandler.wrap(async (_req, res) => {
    try {
      return ApiResponse.ok(res, await SystemService.summary());
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'building the system summary');
    }
  }),

  /**
   * GET /api/v1/health
   *
   * Answers 503 when the daemon is unreachable so container orchestrators and the
   * client both treat a dead socket as unhealthy rather than as an empty volume list.
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
