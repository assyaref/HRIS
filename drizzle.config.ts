import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load production environment first.
// dotenv never overrides variables that are already set.
config({ path: ".env.production" });
config({ path: ".env.local" });
config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required for Drizzle Kit database operations",
  );
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
