import type { WalkupApi } from '../../preload/index';

declare global {
  interface Window {
    walkup: WalkupApi;
  }
}

export {};
