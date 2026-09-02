import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load local overrides first (.env.local, git-ignored), then .env.
// dotenv never overrides variables that are already set.
config({ path: ".env.local" });
config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  ...(connectionString
    ? { dbCredentials: { url: connectionString } }
    : {}),
});
