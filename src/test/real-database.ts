import {Kysely, PostgresDialect, sql} from 'kysely';
import {Pool} from 'pg';
import {Database} from './database.types';

export function createRealTestDatabase(): Kysely<Database> {
    const dialect = new PostgresDialect({
        pool: new Pool({
            host: 'localhost',
            port: 5435,
            user: 'test_user',
            password: 'password',
            database: 'test_db',
        }),
    });

    return new Kysely<Database>({
        dialect,
    });
}

export async function setupTestSchema(db: Kysely<Database>): Promise<void> {
    // Drop tables if they exist
    await sql`DROP TABLE IF EXISTS posts CASCADE`.execute(db);
    await sql`DROP TABLE IF EXISTS "usersResults" CASCADE`.execute(db);
    await sql`DROP TABLE IF EXISTS users CASCADE`.execute(db);

    // Create the schema
    await sql`
        CREATE TABLE users
        (
            id             SERIAL PRIMARY KEY,
            email          VARCHAR(255) UNIQUE NOT NULL,
            name           VARCHAR(255)        NOT NULL,
            role           VARCHAR(50) DEFAULT 'guest',
            status         VARCHAR(50),
            age            INTEGER,
            priority       INTEGER     DEFAULT 0,
            "isVerified"   BOOLEAN     DEFAULT FALSE,
            "appliedRules" JSONB,
            phone          VARCHAR(50),
            created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
            updated_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "usersResults"
        (
            LIKE users INCLUDING ALL,
            applied_rules  text[] NOT NULL DEFAULT '{}'
        );

        CREATE TABLE posts
        (
            id         SERIAL PRIMARY KEY,
            title      VARCHAR(255) NOT NULL,
            content    TEXT         NOT NULL,
            author_id  INTEGER REFERENCES users (id) ON DELETE CASCADE,
            published  BOOLEAN   DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX idx_posts_author_id ON posts (author_id);
        CREATE INDEX idx_posts_published ON posts (published);
        CREATE INDEX idx_users_email ON users (email);
    `.execute(db);
}

export async function cleanupTestDatabase(db: Kysely<Database>): Promise<void> {
    await db.destroy();
}
