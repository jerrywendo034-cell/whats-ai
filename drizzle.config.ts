import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./db/whatsai_drizzle_schema.ts", "./db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://localhost:5432/whatsai",
  },
});
