import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL environment variable is not set!");
  console.error("Please set DATABASE_URL in your environment variables.");
}

// For Prisma 7 with Bun, we need to use Prisma Accelerate or an adapter
// Since we're using standard PostgreSQL, we'll use Accelerate URL if available
// Otherwise, fall back to direct connection (may require adapter in Prisma 7)
const accelerateUrl = process.env.PRISMA_ACCELERATE_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(accelerateUrl ? { accelerateUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
