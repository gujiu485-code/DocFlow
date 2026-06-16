import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/prisma/generated/prisma/client";

type PrismaClientInstance = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  docflowPrisma?: PrismaClientInstance;
};

export const isDatabaseConfigured = () => Boolean(process.env.DATABASE_URL?.trim());

export const getPrisma = () => {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalForPrisma.docflowPrisma) {
    globalForPrisma.docflowPrisma = createPrismaClient(connectionString);
  }

  return globalForPrisma.docflowPrisma;
};

function createPrismaClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
