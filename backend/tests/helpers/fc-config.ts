/**
 * fast-check configuration for property-based tests.
 *
 * Usage:
 *   import { PBT_CONFIG } from '@tests/helpers/fc-config';
 *   fc.assert(fc.property(...), PBT_CONFIG);
 */
import type { Parameters } from 'fast-check';

/**
 * Default fast-check configuration for all property-based tests.
 * - numRuns: 100 minimum iterations per property
 * - verbose: true to display counterexamples on failure
 */
export const PBT_CONFIG: Parameters<unknown> = {
  numRuns: 100,
  verbose: true,
};

/**
 * Extended configuration for more thorough exploration when needed.
 */
export const PBT_CONFIG_EXTENDED: Parameters<unknown> = {
  numRuns: 500,
  verbose: true,
};

/**
 * Quick configuration for fast iteration during development.
 */
export const PBT_CONFIG_QUICK: Parameters<unknown> = {
  numRuns: 20,
  verbose: true,
};
