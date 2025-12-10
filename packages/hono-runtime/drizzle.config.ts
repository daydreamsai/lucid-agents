import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/store/drizzle/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
