// Runs before any test module is imported so module-level configuration
// (throttler limits, Prisma driver selection) sees the test environment.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-change-me-32chars';
