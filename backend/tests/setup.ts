// Test setup file for Vitest
// Global test utilities and configuration

import { expect } from 'vitest';

// Extend timeout for property-based tests that may need longer to explore the input space
// Individual test files can override this if needed

// Global test helpers available in all test files
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'test';
    }
  }
}

// Ensure test environment
process.env.NODE_ENV = 'test';
