import { randomUUID } from 'node:crypto';

const SHORT_ID_LENGTH = 12;

export const Identifier = Object.freeze({
  uuid(): string {
    return randomUUID();
  },

  /** Docker's own short-id convention: first 12 hex characters. */
  shortenContainerId(id: string): string {
    return id.slice(0, SHORT_ID_LENGTH);
  },

  /** Suffix for generated sidecar container names; collision-free per process. */
  nameSuffix(): string {
    return randomUUID().replaceAll('-', '').slice(0, SHORT_ID_LENGTH);
  },
});
