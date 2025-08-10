import { Kysely } from 'kysely';
import { Database, User, NewUser, Post, NewPost } from './database.types';

export class DatabaseService {
  constructor(private db: Kysely<Database>) {}

  // User operations
  async createUser(user: Partial<NewUser>): Promise<User> {
    return await this.db
      .insertInto('users')
      .values(user)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getUserById(id: number): Promise<User | undefined> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
  }

  async getAllUsers(): Promise<User[]> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async updateUser(id: number, updates: Partial<NewUser>): Promise<User> {
    return await this.db
      .updateTable('users')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteUser(id: number): Promise<void> {
    await this.db
      .deleteFrom('users')
      .where('id', '=', id)
      .execute();
  }

  // Post operations
  async createPost(post: NewPost): Promise<Post> {
    return await this.db
      .insertInto('posts')
      .values(post)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getPostById(id: number): Promise<Post | undefined> {
    return await this.db
      .selectFrom('posts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async getPostsByAuthor(authorId: number): Promise<Post[]> {
    return await this.db
      .selectFrom('posts')
      .selectAll()
      .where('author_id', '=', authorId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async getPublishedPosts(): Promise<Post[]> {
    return await this.db
      .selectFrom('posts')
      .selectAll()
      .where('published', '=', true)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async publishPost(id: number): Promise<Post> {
    return await this.db
      .updateTable('posts')
      .set({ published: true })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deletePost(id: number): Promise<void> {
    await this.db
      .deleteFrom('posts')
      .where('id', '=', id)
      .execute();
  }

  // Complex queries
  async getUsersWithPostCount(): Promise<Array<User & { post_count: number }>> {
    const result = await this.db
      .selectFrom('users')
      .leftJoin('posts', 'users.id', 'posts.author_id')
      .select([
        'users.id',
        'users.email',
        'users.name',
        'users.created_at',
        'users.updated_at',
        (eb) => eb.fn.count('posts.id').as('post_count')
      ])
      .groupBy(['users.id', 'users.email', 'users.name', 'users.created_at', 'users.updated_at'])
      .execute();

    return result.map(row => ({
      ...row,
      post_count: Number(row.post_count)
    })) as Array<User & { post_count: number }>;
  }
}
