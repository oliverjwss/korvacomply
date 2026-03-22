/* Minimal ZAF client typing for the sidebar app */

export type ZafContext = {
  account?: { subdomain?: string };
};

export type ZafMetadata = {
  settings?: Record<string, string | undefined>;
};

export type ZafClient = {
  context: () => Promise<ZafContext>;
  metadata: () => Promise<ZafMetadata>;
  get: (paths: string | string[]) => Promise<Record<string, unknown>>;
  set: (
    key: string | Record<string, unknown>,
    value?: unknown
  ) => Promise<void>;
  invoke: (name: string, data?: unknown) => Promise<unknown>;
  on: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    ZAFClient?: {
      init: () => ZafClient;
    };
  }
}

export {};
