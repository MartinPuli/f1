import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local first.');
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(new URL('../db/postgres/001_archive.sql', import.meta.url), 'utf8');
// Keep the PL/pgSQL body intact; its internal semicolons aren't statement boundaries.
const boundary = source.indexOf('CREATE OR REPLACE FUNCTION');
const functionEnd = source.indexOf('$$;', boundary) + 3;
const statements = [
  ...source
    .slice(0, boundary)
    .split(';')
    .filter((s) => s.trim() && !/^\s*--[^\n]*\s*$/.test(s)),
  source.slice(boundary, functionEnd),
  ...source
    .slice(functionEnd)
    .split(';')
    .filter((s) => s.trim()),
];
try {
  for (const statement of statements)
    await sql.query(statement, [], { fetchOptions: { signal: AbortSignal.timeout(15000) } });
  console.log('Archive schema ready.');
} catch {
  console.error('Could not create the archive schema. Check the database connection.');
  process.exitCode = 1;
}
