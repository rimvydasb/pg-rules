import { newDb } from 'pg-mem';
import { Kysely, PostgresDialect } from 'kysely';
import { Database } from './database.types';

export function createTestDatabase(): Kysely<Database> {
  // Create an in-memory PostgreSQL database
  const db = newDb();

  // Create the schema
  db.public.none(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      published BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_posts_author_id ON posts(author_id);
    CREATE INDEX idx_posts_published ON posts(published);
    CREATE INDEX idx_users_email ON users(email);
  `);

  // Get the pg adapter for Kysely - use the Pool from the adapter
  const { Pool } = db.adapters.createPg();

  // Create Kysely instance with the pg-mem adapter
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool(),
    }),
  });
}
