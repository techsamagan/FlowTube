import { PrismaClient } from '@prisma/client';

// Single PrismaClient instance reused across the process / hot reloads.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__flowtubePrisma ?? new PrismaClient();

if (!globalForPrisma.__flowtubePrisma) {
  globalForPrisma.__flowtubePrisma = prisma;
}
