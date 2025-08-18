import {Kysely, PostgresDialect, SqliteDialect, sql} from 'kysely'
import type {Database} from './database.types'

/**
 * Create a Kysely instance for tests.
 *
 * By default an in-memory SQLite database is used. If the USE_PG_TESTS flag is
 * truthy, a Postgres database running on localhost:5435 with the credentials
 * `test_user`/`password` and database `test_db` is used instead. The connection
 * operates inside the "test" schema which is dropped and recreated for every
 * invocation.
 */
export async function createTestDb(): Promise<Kysely<Database>> {
    const usePg = !!process.env.USE_PG_TESTS
    if (usePg) {
        const {Pool} = await import('pg')
        const dialect = new PostgresDialect({
            pool: new Pool({
                host: 'localhost',
                port: 5435,
                user: 'test_user',
                password: 'password',
                database: 'test_db'
            })
        })
        const db = new Kysely<Database>({dialect})
        const result = await sql`SELECT 1`.execute(db)
        if (result.rows.length === 0) {
            throw new Error('Failed to connect to the Postgres test database')
        }
        await sql`DROP SCHEMA IF EXISTS test CASCADE`.execute(db)
        await sql`CREATE SCHEMA test`.execute(db)
        await sql`SET search_path TO test`.execute(db)
        await createSchema(db)
        return db
    }

    const {default: BetterSqlite3} = await import('better-sqlite3')
    const sqlite = new BetterSqlite3(':memory:')
    sqlite.function('regexp_like', (s: string | null, p: string) => {
        const regexp = new RegExp(p)
        return s ? (regexp.test(s) ? 1 : 0) : 0
    })
    sqlite.function('json_array', () => '[]')
    sqlite.function('json_array_append', (target: string | null, path: string, value: any) => {
        if (path !== '$') {
            throw new Error('json_array_append mock only supports path "$"')
        }
        const base = target ? JSON.parse(target) : []
        base.push(value)
        return JSON.stringify(base)
    })
    const db = new Kysely<Database>({
        dialect: new SqliteDialect({database: sqlite})
    })
    await createSchema(db)
    return db
}

async function createSchema(db: Kysely<Database>): Promise<void> {
    const usePg = !!process.env.USE_PG_TESTS

    await db.schema
        .createTable('users')
        .addColumn('id', 'integer', col => {
            if (usePg) {
                return col.primaryKey().generatedAlwaysAsIdentity()
            } else {
                return col.primaryKey().autoIncrement()
            }
        })
        .addColumn('email', 'text', col => col.notNull().unique())
        .addColumn('name', 'text', col => col.notNull())
        .addColumn('role', 'text', col => col.defaultTo('guest'))
        .addColumn('status', 'text')
        .addColumn('age', 'integer')
        .addColumn('priority', 'integer', col => col.defaultTo(0))
        .addColumn('isVerified', 'boolean', col => col.defaultTo(false))
        .addColumn('appliedRules', 'json')
        .addColumn('phone', 'text')
        .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .addColumn('updated_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .execute()

    await db.schema
        .createTable('posts')
        .addColumn('id', 'integer', col => {
            if (usePg) {
                return col.primaryKey().generatedAlwaysAsIdentity()
            } else {
                return col.primaryKey().autoIncrement()
            }
        })
        .addColumn('title', 'text', col => col.notNull())
        .addColumn('content', 'text', col => col.notNull())
        .addColumn('author_id', 'integer', col => col.references('users.id').onDelete('cascade'))
        .addColumn('published', 'boolean', col => col.defaultTo(false))
        .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .addColumn('updated_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .execute()

    await db.schema.createIndex('idx_posts_author_id').on('posts').column('author_id').execute()
    await db.schema.createIndex('idx_posts_published').on('posts').column('published').execute()
    await db.schema.createIndex('idx_users_email').on('users').column('email').execute()
}
