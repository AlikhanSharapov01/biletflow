// Idempotency keys for case and message sends. A retry of the identical
// payload reuses its key (the server replays the original); a changed payload
// gets a fresh key, since reusing it would be a 409 client_message_conflict.
export interface RetryKeys {
  keyFor: (payload: unknown) => string;
  reset: () => void;
}

export function createRetryKeys(generate: () => string = () => crypto.randomUUID()): RetryKeys {
  let last: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(payload) {
      const fingerprint = JSON.stringify(payload);
      if (!last || last.fingerprint !== fingerprint) last = { fingerprint, key: generate() };
      return last.key;
    },
    reset() {
      last = null;
    },
  };
}
