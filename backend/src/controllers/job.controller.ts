import { ScanQueue } from '../queue/index.queue.js';
import { ApiErrors, ApiResponse, AsyncHandler } from '../utils/index.utils.js';
import { VolumeValidation } from '../validations/index.validations.js';

export const JOB_ID_PARAM = 'id';

export const JobController = Object.freeze({
  /** GET /api/v1/jobs/:id — polled by the client while a scan is in flight. */
  detail: AsyncHandler.wrap(async (req, res) => {
    try {
      const id = VolumeValidation.jobId(req.params[JOB_ID_PARAM]);
      const job = ScanQueue.find(id);
      if (!job) {
        throw ApiErrors.jobNotFound(id);
      }
      return ApiResponse.ok(res, job);
    } catch (error) {
      throw ApiErrors.wrapUnknown(error, 'loading a scan job');
    }
  }),
});
