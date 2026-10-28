import 'dotenv/config';

// Integration tests write to the database: never run them against the real (dev) data.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required to run the API tests (see apps/api/.env.example). ' +
      'Create the database with `docker compose exec db createdb -U tatamap tatamap_test`, ' +
      'then run `pnpm db:test:reset`.',
  );
}
process.env.DATABASE_URL = testDatabaseUrl;
