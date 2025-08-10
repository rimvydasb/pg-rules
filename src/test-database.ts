import {DataType, newDb} from 'pg-mem';
import {Kysely, PostgresDialect} from 'kysely';
import {Database} from './database.types';

export function createTestDatabase(): Kysely<Database> {
    // Create an in-memory PostgreSQL database
    const db = newDb();

    // Create the schema
    db.public.none(`
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
    `);

    const publicSchema = db.public;

    // CASE-SENSITIVE: regexp_like(string, pattern[, flags])
    publicSchema.registerFunction({
        name: 'regexp_like',
        args: [DataType.text, DataType.text],
        returns: DataType.bool,
        implementation: (s: string | null, p: string) => {
          const regexp =   new RegExp(p);
          const result = s ? regexp.test(s) : false;
          return result;
        }
    });

    publicSchema.registerFunction({
        name: 'json_array',
        args: [],
        returns: DataType.jsonb,
        implementation: () => ([] as any),
    });

    // JSON_ARRAY_APPEND(target, path, value)
    // We implement the only case you use: path === '$' (root), target is an array.
    // Two overloads so you can pass either a JSONB or a plain SQL string as value.
    const appendImpl = (target: any, path: string, value: any) => {
        if (path !== '$') {
            throw new Error('JSON_ARRAY_APPEND mock only supports path "$"');
        }
        const base = Array.isArray(target) ? [...target] : (target == null ? [] : target);
        // If value is a scalar (text/number/bool), keep it as-is. That matches MySQL behavior.
        base.push(value);
        return base;
    };

    publicSchema.registerFunction({
        name: 'json_array_append',
        args: [DataType.jsonb, DataType.text, DataType.jsonb],
        returns: DataType.jsonb,
        implementation: appendImpl,
    });

    // Overload for when the 3rd arg is a plain SQL text literal (e.g., 'track-rule')
    publicSchema.registerFunction({
        name: 'json_array_append',
        args: [DataType.jsonb, DataType.text, DataType.text],
        returns: DataType.jsonb,
        implementation: (t: any, p: string, v: string) => appendImpl(t, p, JSON.stringify(v)),
    });

    // Get the pg adapter for Kysely - use the Pool from the adapter
    const {Pool} = db.adapters.createPg();

    // Create Kysely instance with the pg-mem adapter
    return new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool(),
        }),
    });
}
