import { ApiErrors } from '../utils/index.utils.js';

export interface TaskQueueStats {
  queued: number;
  running: number;
  concurrency: number;
  completed: number;
  failed: number;
}

export interface TaskQueueInstance {
  /** Rejects immediately with QUEUE_SATURATED when the backlog is at its limit. */
  submit<TResult>(task: () => Promise<TResult>): Promise<TResult>;
  stats(): TaskQueueStats;
  /** Zero-based position a task submitted right now would occupy. */
  backlog(): number;
  /** Lets callers refuse work synchronously instead of handing back a doomed handle. */
  isSaturated(): boolean;
}

export interface TaskQueueOptions {
  concurrency: number;
  /** Maximum queued (not running) tasks before submissions are refused. */
  limit: number;
}

/**
 * Bounded-concurrency FIFO queue.
 *
 * Volume measurement is IO-bound work executed by the Docker daemon, not by this
 * process — we await a container, we do not compute anything. Worker threads would
 * therefore buy nothing but complexity; what actually needs bounding is how many
 * simultaneous tree walks we ask the daemon's disk to perform, and how deep the
 * backlog is allowed to grow before we push back on callers.
 */
export const TaskQueue = Object.freeze({
  create(options: TaskQueueOptions): TaskQueueInstance {
    const pending: Array<() => void> = [];
    let running = 0;
    let completed = 0;
    let failed = 0;

    const pump = (): void => {
      if (running >= options.concurrency) {
        return;
      }
      const start = pending.shift();
      if (!start) {
        return;
      }
      running += 1;
      start();
    };

    return {
      async submit<TResult>(task: () => Promise<TResult>): Promise<TResult> {
        if (pending.length >= options.limit) {
          throw ApiErrors.queueSaturated(options.limit);
        }

        return new Promise<TResult>((resolveTask, rejectTask) => {
          pending.push(() => {
            task()
              .then(
                (value) => {
                  completed += 1;
                  resolveTask(value);
                },
                (error: unknown) => {
                  failed += 1;
                  rejectTask(error);
                },
              )
              .finally(() => {
                running -= 1;
                pump();
              });
          });
          pump();
        });
      },

      stats(): TaskQueueStats {
        return { queued: pending.length, running, concurrency: options.concurrency, completed, failed };
      },

      backlog(): number {
        return pending.length;
      },

      isSaturated(): boolean {
        return pending.length >= options.limit;
      },
    };
  },
});
