import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;

if (!connectionString || connectionString.includes('user:password')) {
  console.error('\n❌ ERROR: Invalid DATABASE_URL detected.');
  console.error('It looks like you are still using the placeholder: "postgresql://user:password@host:port/dbname"');
  console.error('Please update your .env file with your actual Supabase connection string.\n');
  process.exit(1);
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
