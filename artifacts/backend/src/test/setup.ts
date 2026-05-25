// Runs before every test file. Sets env vars before env.ts validation fires.
process.env["JWT_SECRET"] = "vitest-test-secret-minimum-16-chars!!";
process.env["DATABASE_URL"] = "postgresql://localhost:5432/test";
process.env["AWS_ACCESS_KEY_ID"] = "test-key";
process.env["AWS_SECRET_ACCESS_KEY"] = "test-secret";
process.env["S3_BUCKET"] = "test-bucket";
process.env["REDIS_HOST"] = "localhost";
process.env["REDIS_PORT"] = "6379";
process.env["PORT"] = "3001";
process.env["NODE_ENV"] = "test";
