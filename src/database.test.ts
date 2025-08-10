import { Kysely } from 'kysely';
import { Database } from './database.types';
import { DatabaseService } from './database.service';
import { createTestDatabase } from './test-database';

describe('DatabaseService with Kysely and pg-mem', () => {
  let db: Kysely<Database>;
  let dbService: DatabaseService;

  beforeEach(() => {
    // Create a fresh in-memory database for each test
    db = createTestDatabase();
    dbService = new DatabaseService(db);
  });

  afterEach(async () => {
    // Clean up after each test
    await db.destroy();
  });

  describe('User operations', () => {
    it('should create a user', async () => {
      const newUser = {
        email: 'john@example.com',
        name: 'John Doe'
      };

      const user = await dbService.createUser(newUser);

      expect(user).toMatchObject({
        id: expect.any(Number),
        email: 'john@example.com',
        name: 'John Doe',
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      });
      expect(user.id).toBeGreaterThan(0);
    });

    it('should get user by id', async () => {
      const newUser = {
        email: 'jane@example.com',
        name: 'Jane Smith'
      };

      const createdUser = await dbService.createUser(newUser);
      const foundUser = await dbService.getUserById(createdUser.id);

      expect(foundUser).toEqual(createdUser);
    });

    it('should get user by email', async () => {
      const newUser = {
        email: 'alice@example.com',
        name: 'Alice Johnson'
      };

      const createdUser = await dbService.createUser(newUser);
      const foundUser = await dbService.getUserByEmail('alice@example.com');

      expect(foundUser).toEqual(createdUser);
    });

    it('should return undefined for non-existent user', async () => {
      const user = await dbService.getUserById(999);
      expect(user).toBeUndefined();
    });

    it('should get all users', async () => {
      const users = [
        { email: 'user1@example.com', name: 'User One' },
        { email: 'user2@example.com', name: 'User Two' },
        { email: 'user3@example.com', name: 'User Three' }
      ];

      for (const userData of users) {
        await dbService.createUser(userData);
      }

      const allUsers = await dbService.getAllUsers();
      expect(allUsers).toHaveLength(3);
      expect(allUsers.map(u => u.email)).toEqual(
        expect.arrayContaining(['user1@example.com', 'user2@example.com', 'user3@example.com'])
      );
    });

    it('should update a user', async () => {
      const newUser = await dbService.createUser({
        email: 'bob@example.com',
        name: 'Bob Wilson'
      });

      const updatedUser = await dbService.updateUser(newUser.id, {
        name: 'Robert Wilson'
      });

      expect(updatedUser.name).toBe('Robert Wilson');
      expect(updatedUser.email).toBe('bob@example.com');
      expect(updatedUser.id).toBe(newUser.id);
    });

    it('should delete a user', async () => {
      const newUser = await dbService.createUser({
        email: 'delete@example.com',
        name: 'Delete Me'
      });

      await dbService.deleteUser(newUser.id);
      const foundUser = await dbService.getUserById(newUser.id);

      expect(foundUser).toBeUndefined();
    });
  });

  describe('Post operations', () => {
    let author: any;

    beforeEach(async () => {
      author = await dbService.createUser({
        email: 'author@example.com',
        name: 'Post Author'
      });
    });

    it('should create a post', async () => {
      const newPost = {
        title: 'My First Post',
        content: 'This is the content of my first post.',
        author_id: author.id,
        published: false
      };

      const post = await dbService.createPost(newPost);

      expect(post).toMatchObject({
        id: expect.any(Number),
        title: 'My First Post',
        content: 'This is the content of my first post.',
        author_id: author.id,
        published: false,
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      });
    });

    it('should get post by id', async () => {
      const newPost = await dbService.createPost({
        title: 'Test Post',
        content: 'Test content',
        author_id: author.id,
        published: true
      });

      const foundPost = await dbService.getPostById(newPost.id);

      expect(foundPost).toEqual(newPost);
    });

    it('should get posts by author', async () => {
      const posts = [
        { title: 'Post 1', content: 'Content 1', author_id: author.id, published: true },
        { title: 'Post 2', content: 'Content 2', author_id: author.id, published: false },
        { title: 'Post 3', content: 'Content 3', author_id: author.id, published: true }
      ];

      for (const postData of posts) {
        await dbService.createPost(postData);
      }

      const authorPosts = await dbService.getPostsByAuthor(author.id);
      expect(authorPosts).toHaveLength(3);
      expect(authorPosts.map(p => p.title)).toEqual(
        expect.arrayContaining(['Post 1', 'Post 2', 'Post 3'])
      );
    });

    it('should get only published posts', async () => {
      const posts = [
        { title: 'Published 1', content: 'Content 1', author_id: author.id, published: true },
        { title: 'Draft 1', content: 'Content 2', author_id: author.id, published: false },
        { title: 'Published 2', content: 'Content 3', author_id: author.id, published: true }
      ];

      for (const postData of posts) {
        await dbService.createPost(postData);
      }

      const publishedPosts = await dbService.getPublishedPosts();
      expect(publishedPosts).toHaveLength(2);
      expect(publishedPosts.every(p => p.published)).toBe(true);
      expect(publishedPosts.map(p => p.title)).toEqual(
        expect.arrayContaining(['Published 1', 'Published 2'])
      );
    });

    it('should publish a post', async () => {
      const newPost = await dbService.createPost({
        title: 'Draft Post',
        content: 'This is a draft',
        author_id: author.id,
        published: false
      });

      const publishedPost = await dbService.publishPost(newPost.id);

      expect(publishedPost.published).toBe(true);
      expect(publishedPost.id).toBe(newPost.id);
    });

    it('should delete a post', async () => {
      const newPost = await dbService.createPost({
        title: 'To Be Deleted',
        content: 'This post will be deleted',
        author_id: author.id,
        published: false
      });

      await dbService.deletePost(newPost.id);
      const foundPost = await dbService.getPostById(newPost.id);

      expect(foundPost).toBeUndefined();
    });
  });

  describe('Complex queries', () => {
    it('should get users with post count', async () => {
      // Create users
      const user1 = await dbService.createUser({
        email: 'prolific@example.com',
        name: 'Prolific Writer'
      });

      const user2 = await dbService.createUser({
        email: 'casual@example.com',
        name: 'Casual Writer'
      });

      const user3 = await dbService.createUser({
        email: 'lurker@example.com',
        name: 'Just Lurking'
      });

      // Create posts
      await dbService.createPost({
        title: 'Post 1',
        content: 'Content 1',
        author_id: user1.id,
        published: true
      });

      await dbService.createPost({
        title: 'Post 2',
        content: 'Content 2',
        author_id: user1.id,
        published: true
      });

      await dbService.createPost({
        title: 'Post 3',
        content: 'Content 3',
        author_id: user1.id,
        published: false
      });

      await dbService.createPost({
        title: 'Single Post',
        content: 'Only post',
        author_id: user2.id,
        published: true
      });

      // user3 has no posts

      const usersWithPostCount = await dbService.getUsersWithPostCount();

      expect(usersWithPostCount).toHaveLength(3);

      const prolificUser = usersWithPostCount.find(u => u.email === 'prolific@example.com');
      const casualUser = usersWithPostCount.find(u => u.email === 'casual@example.com');
      const lurkerUser = usersWithPostCount.find(u => u.email === 'lurker@example.com');

      expect(prolificUser?.post_count).toBe(3);
      expect(casualUser?.post_count).toBe(1);
      expect(lurkerUser?.post_count).toBe(0);
    });
  });

  describe('Database constraints and relationships', () => {
    it('should enforce foreign key constraints', async () => {
      // Try to create a post with non-existent author
      const invalidPost = {
        title: 'Orphaned Post',
        content: 'This post has no valid author',
        author_id: 999, // Non-existent user ID
        published: false
      };

      await expect(dbService.createPost(invalidPost)).rejects.toThrow();
    });

    it('should enforce unique email constraint', async () => {
      await dbService.createUser({
        email: 'unique@example.com',
        name: 'First User'
      });

      await expect(dbService.createUser({
        email: 'unique@example.com',
        name: 'Second User'
      })).rejects.toThrow();
    });

    it('should cascade delete posts when user is deleted', async () => {
      const user = await dbService.createUser({
        email: 'cascade@example.com',
        name: 'User To Delete'
      });

      const post = await dbService.createPost({
        title: 'Will Be Deleted',
        content: 'This post will be deleted with user',
        author_id: user.id,
        published: true
      });

      // Delete the user
      await dbService.deleteUser(user.id);

      // Post should also be deleted due to CASCADE
      const foundPost = await dbService.getPostById(post.id);
      expect(foundPost).toBeUndefined();
    });
  });
});
