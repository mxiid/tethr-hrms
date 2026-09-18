/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  setupFiles: ['reflect-metadata'],
  moduleNameMapper: {
    '^@hrms/shared$': '<rootDir>/../shared/src/index.ts',
  },
};
