import { createTestDatabase } from './test-database';
import { PgRulesEngine } from './PgRulesEngine';
import { MatchRule } from './MatchRule';
import { User, NewUser } from './database.types';
import {MatchRuleFactory} from "./MatchRuleFactory";

describe('PgRulesEngine', () => {
  let db: any;
  let rulesEngine: PgRulesEngine;

  beforeEach(async () => {
    db = createTestDatabase();
    rulesEngine = new PgRulesEngine(db);

    // Insert test users
    await db
      .insertInto('users')
      .values([
        { email: 'john@example.com', name: 'John Doe' },
        { email: 'jane@example.com', name: 'Jane Smith' },
        { email: 'bob@example.com', name: 'Bob Johnson' },
        { email: 'alice@example.com', name: 'Alice Brown' },
      ])
      .execute();
  });

  describe('applyRules', () => {
    it('should apply a single rule to update user names', async () => {
      // Create a rule to update John's name
      const rule = MatchRuleFactory.createRule<User>(
        'update-john-name',
        { email: 'john@example.com' },
        { name: 'John Updated' }
      );

      const affectedRows = await rulesEngine.applyRules([rule], 'users');

      expect(affectedRows).toBe(1);

      // Verify the update was applied
      const updatedUser = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', 'john@example.com')
        .executeTakeFirst();

      expect(updatedUser.name).toBe('John Updated');
    });

    it('should apply multiple rules in a single transaction', async () => {
      const rules = [
        MatchRuleFactory.createRule<User>(
          'update-john',
          { email: 'john@example.com' },
          { name: 'John Modified' }
        ),
        MatchRuleFactory.createRule<User>(
          'update-jane',
          { email: 'jane@example.com' },
          { name: 'Jane Modified' }
        ),
      ];

      const affectedRows = await rulesEngine.applyRules(rules, 'users');

      expect(affectedRows).toBe(2);

      // Verify both updates were applied
      const users = await db
        .selectFrom('users')
        .selectAll()
        .where('email', 'in', ['john@example.com', 'jane@example.com'])
        .execute();

      expect(users).toHaveLength(2);
      expect(users.find((u: User) => u.email === 'john@example.com')?.name).toBe('John Modified');
      expect(users.find((u: User) => u.email === 'jane@example.com')?.name).toBe('Jane Modified');
    });

    it('should handle rules with multiple match conditions', async () => {
      // First, update one user to have a specific name
      await db
        .updateTable('users')
        .set({ name: 'Target User' })
        .where('email', '=', 'bob@example.com')
        .execute();

      const rule = MatchRuleFactory.createRule<User>(
        'update-specific-user',
        { email: 'bob@example.com', name: 'Target User' },
        { name: 'Updated Target User' }
      );

      const affectedRows = await rulesEngine.applyRules([rule], 'users');

      expect(affectedRows).toBe(1);

      const updatedUser = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', 'bob@example.com')
        .executeTakeFirst();

      expect(updatedUser.name).toBe('Updated Target User');
    });

    it('should return 0 when no rules match any records', async () => {
      const rule = MatchRuleFactory.createRule<User>(
        'update-nonexistent',
        { email: 'nonexistent@example.com' },
        { name: 'Should Not Update' }
      );

      const affectedRows = await rulesEngine.applyRules([rule], 'users');

      expect(affectedRows).toBe(0);

      // Verify no users were changed
      const allUsers = await db
        .selectFrom('users')
        .selectAll()
        .execute();

      expect(allUsers).toHaveLength(4);
      expect(allUsers.every((u: User) => !u.name.includes('Should Not Update'))).toBe(true);
    });

    it('should return 0 when given an empty rules array', async () => {
      const affectedRows = await rulesEngine.applyRules([], 'users');

      expect(affectedRows).toBe(0);
    });

    it('should skip rules with empty apply objects', async () => {
      const rules = [
        MatchRuleFactory.createRule<User>(
          'empty-apply',
          { email: 'john@example.com' },
          {} // Empty apply object
        ),
        MatchRuleFactory.createRule<User>(
          'valid-rule',
          { email: 'jane@example.com' },
          { name: 'Jane Updated' }
        ),
      ];

      const affectedRows = await rulesEngine.applyRules(rules, 'users');

      expect(affectedRows).toBe(1); // Only the valid rule should be applied

      // Verify only Jane was updated
      const john = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', 'john@example.com')
        .executeTakeFirst();

      const jane = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', 'jane@example.com')
        .executeTakeFirst();

      expect(john.name).toBe('John Doe'); // Unchanged
      expect(jane.name).toBe('Jane Updated'); // Changed
    });

    it('should handle rules that update multiple fields', async () => {
      const rule = MatchRuleFactory.createRule<User>(
        'update-multiple-fields',
        { email: 'alice@example.com' },
        {
          name: 'Alice Updated',
          email: 'alice.updated@example.com'
        }
      );

      const affectedRows = await rulesEngine.applyRules([rule], 'users');

      expect(affectedRows).toBe(1);

      // Verify both fields were updated
      const updatedUser = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', 'alice.updated@example.com')
        .executeTakeFirst();

      expect(updatedUser).toBeDefined();
      expect(updatedUser.name).toBe('Alice Updated');
      expect(updatedUser.email).toBe('alice.updated@example.com');
    });

    it('should maintain transaction integrity on error', async () => {
        // Do not write this test.
    });
  });
});
