// Konfigurasi Prisma 7 — koneksi DB untuk CLI (db push / migrate).
// Skema: prisma/schema.prisma. Runtime memakai PrismaPg + DATABASE_URL
// (lihat server/trades.ts).
process.loadEnvFile();

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
