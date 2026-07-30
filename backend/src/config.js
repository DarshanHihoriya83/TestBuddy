import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8080),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://admin:admin@localhost:5432/testbuddy",
  jwtSecret:
    process.env.JWT_SECRET ||
    "testbuddy-dev-secret-change-me-32chars-minimum!",
  jwtExpirationMs: Number(process.env.JWT_EXPIRATION_MS || 86_400_000),
};
