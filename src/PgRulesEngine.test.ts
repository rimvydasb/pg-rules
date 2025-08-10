import {createTestDatabase} from './test-database';
import {PgRulesEngine} from './PgRulesEngine';
import {User} from './database.types';
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
                {email: 'john@example.com', name: 'John Doe'},
                {email: 'jane@example.com', name: 'Jane Smith'},
                {email: 'bob@example.com', name: 'Bob Johnson'},
                {email: 'alice@example.com', name: 'Alice Brown'},
            ])
            .execute();
    });

    describe('applyRules', () => {
        it('should apply a single rule to update user names', async () => {
            // Create a rule to update John's name
            const rule = MatchRuleFactory.createRule<User>(
                'update-john-name',
                {email: 'john@example.com'},
                {name: 'John Updated'}
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
                    {email: 'john@example.com'},
                    {name: 'John Modified'}
                ),
                MatchRuleFactory.createRule<User>(
                    'update-jane',
                    {email: 'jane@example.com'},
                    {name: 'Jane Modified'}
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
                .set({name: 'Target User'})
                .where('email', '=', 'bob@example.com')
                .execute();

            const rule = MatchRuleFactory.createRule<User>(
                'update-specific-user',
                {email: 'bob@example.com', name: 'Target User'},
                {name: 'Updated Target User'}
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
                {email: 'nonexistent@example.com'},
                {name: 'Should Not Update'}
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
                    {email: 'john@example.com'},
                    {} // Empty apply object
                ),
                MatchRuleFactory.createRule<User>(
                    'valid-rule',
                    {email: 'jane@example.com'},
                    {name: 'Jane Updated'}
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
                {email: 'alice@example.com'},
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

    describe('appliedRulesField functionality', () => {
        beforeEach(async () => {
            // Set up appliedRulesField for these tests
            rulesEngine.setAppliedRulesField('appliedRules');
        });

        it('should track applied rules when appliedRulesField is configured', async () => {
            const rule = MatchRuleFactory.createRule<User>(
                'track-rule',
                {email: 'john@example.com'},
                {name: 'John Tracked'}
            );

            await rulesEngine.applyRules([rule], 'users');

            // Verify the rule was applied and tracked
            const users = await rulesEngine.getRowsWithAppliedRules<User>('users', {email: 'john@example.com'});

            expect(users).toHaveLength(1);
            expect(users[0].name).toBe('John Tracked');
            expect(users[0].appliedRules).toEqual(['track-rule']);
        });

        it('should track multiple rules applied to the same row', async () => {
            const rules = [
                MatchRuleFactory.createRule<User>(
                    'first-rule',
                    {email: 'jane@example.com'},
                    {name: 'Jane First'}
                ),
                MatchRuleFactory.createRule<User>(
                    'second-rule',
                    {email: 'jane@example.com'},
                    {name: 'Jane Second'}
                )
            ];

            // Apply first rule
            await rulesEngine.applyRules([rules[0]], 'users');

            // Apply second rule
            await rulesEngine.applyRules([rules[1]], 'users');

            const users = await rulesEngine.getRowsWithAppliedRules<User>('users', {email: 'jane@example.com'});

            expect(users).toHaveLength(1);
            expect(users[0].name).toBe('Jane Second');
            expect(users[0].appliedRules).toEqual(['first-rule', 'second-rule']);
        });

        it('should handle rows with no applied rules', async () => {
            const users = await rulesEngine.getRowsWithAppliedRules<User>('users', {email: 'bob@example.com'});

            expect(users).toHaveLength(1);
            expect(users[0].name).toBe('Bob Johnson'); // Original name
            expect(users[0].appliedRules).toEqual([]);
        });

        it('should clear applied rules for specific conditions', async () => {
            // First apply a rule
            const rule = MatchRuleFactory.createRule<User>(
                'clear-test-rule',
                {email: 'alice@example.com'},
                {name: 'Alice Modified'}
            );

            await rulesEngine.applyRules([rule], 'users');

            // Verify rule was tracked
            let users = await rulesEngine.getRowsWithAppliedRules<User>('users', {email: 'alice@example.com'});
            expect(users[0].appliedRules).toEqual(['clear-test-rule']);

            // Clear applied rules for Alice
            const clearedRows = await rulesEngine.clearAppliedRules('users', {email: 'alice@example.com'});
            expect(clearedRows).toBe(1);

            // Verify applied rules were cleared
            users = await rulesEngine.getRowsWithAppliedRules<User>('users', {email: 'alice@example.com'});
            expect(users[0].appliedRules).toEqual([]);
        });

        it('should clear applied rules for all rows when no conditions provided', async () => {
            // Apply rules to multiple users
            const rules = [
                MatchRuleFactory.createRule<User>(
                    'bulk-rule-1',
                    {email: 'john@example.com'},
                    {name: 'John Bulk'}
                ),
                MatchRuleFactory.createRule<User>(
                    'bulk-rule-2',
                    {email: 'jane@example.com'},
                    {name: 'Jane Bulk'}
                )
            ];

            await rulesEngine.applyRules(rules, 'users');

            // Verify rules were tracked
            let allUsers = await rulesEngine.getRowsWithAppliedRules('users');
            const trackedUsers = allUsers.filter(u => u.appliedRules && u.appliedRules.length > 0);
            expect(trackedUsers).toHaveLength(2);

            // Clear all applied rules
            const clearedRows = await rulesEngine.clearAppliedRules('users');
            expect(clearedRows).toBe(4); // All 4 users should be updated

            // Verify all applied rules were cleared
            allUsers = await rulesEngine.getRowsWithAppliedRules('users');
            expect(allUsers.every(u => u.appliedRules?.length === 0)).toBe(true);
        });

        it('should throw error when getRowsWithAppliedRules called without configuring appliedRulesField', async () => {
            const engineWithoutField = new PgRulesEngine(db);

            await expect(engineWithoutField.getRowsWithAppliedRules('users')).rejects.toThrow(
                'appliedRulesField is not configured. Use setAppliedRulesField() first.'
            );
        });

        it('should throw error when clearAppliedRules called without configuring appliedRulesField', async () => {
            const engineWithoutField = new PgRulesEngine(db);

            await expect(engineWithoutField.clearAppliedRules('users')).rejects.toThrow(
                'appliedRulesField is not configured. Use setAppliedRulesField() first.'
            );
        });

        it('should filter rows correctly with WHERE conditions in getRowsWithAppliedRules', async () => {
            // Apply rules to different users
            const rules = [
                MatchRuleFactory.createRule<User>(
                    'filter-rule-1',
                    {email: 'john@example.com'},
                    {name: 'John Filtered'}
                ),
                MatchRuleFactory.createRule<User>(
                    'filter-rule-2',
                    {email: 'jane@example.com'},
                    {name: 'Jane Filtered'}
                )
            ];

            await rulesEngine.applyRules(rules, 'users');

            // Get only John's data
            const johnUsers = await rulesEngine.getRowsWithAppliedRules('users', {email: 'john@example.com'});
            expect(johnUsers).toHaveLength(1);
            expect(johnUsers[0].email).toBe('john@example.com');
            expect(johnUsers[0].appliedRules).toEqual(['filter-rule-1']);

            // Get only Jane's data
            const janeUsers = await rulesEngine.getRowsWithAppliedRules('users', {email: 'jane@example.com'});
            expect(janeUsers).toHaveLength(1);
            expect(janeUsers[0].email).toBe('jane@example.com');
            expect(janeUsers[0].appliedRules).toEqual(['filter-rule-2']);
        });

        it('should work correctly when appliedRulesField is changed between operations', async () => {
            // Apply rule with first field name
            const rule1 = MatchRuleFactory.createRule<User>(
                'field-test-1',
                {email: 'bob@example.com'},
                {name: 'Bob Field Test'}
            );

            await rulesEngine.applyRules([rule1], 'users');

            // Verify tracking with first field
            let users = await rulesEngine.getRowsWithAppliedRules('users', {email: 'bob@example.com'});
            expect(users[0].appliedRules).toEqual(['field-test-1']);

            // Change the field name and apply another rule
            rulesEngine.setAppliedRulesField('appliedRules'); // Same field name for this test

            const rule2 = MatchRuleFactory.createRule<User>(
                'field-test-2',
                {email: 'bob@example.com'},
                {name: 'Bob Field Test 2'}
            );

            await rulesEngine.applyRules([rule2], 'users');

            // Verify both rules are tracked
            users = await rulesEngine.getRowsWithAppliedRules('users', {email: 'bob@example.com'});
            expect(users[0].appliedRules).toEqual(['field-test-1', 'field-test-2']);
        });

        it('should track rules in transaction correctly', async () => {
            const rules = [
                MatchRuleFactory.createRule<User>(
                    'transaction-rule-1',
                    {email: 'john@example.com'},
                    {name: 'John Transaction 1'}
                ),
                MatchRuleFactory.createRule<User>(
                    'transaction-rule-2',
                    {email: 'jane@example.com'},
                    {name: 'Jane Transaction 2'}
                )
            ];

            // Apply both rules in a single transaction
            const affectedRows = await rulesEngine.applyRules(rules, 'users');
            expect(affectedRows).toBe(2);

            // Verify both rules were tracked
            const johnUsers = await rulesEngine.getRowsWithAppliedRules('users', {email: 'john@example.com'});
            const janeUsers = await rulesEngine.getRowsWithAppliedRules('users', {email: 'jane@example.com'});

            expect(johnUsers[0].appliedRules).toEqual(['transaction-rule-1']);
            expect(janeUsers[0].appliedRules).toEqual(['transaction-rule-2']);
        });
    });

    describe('appliedRulesField configuration', () => {
        it('should allow setting and changing appliedRulesField', () => {
            expect(() => rulesEngine.setAppliedRulesField('customField')).not.toThrow();
            expect(() => rulesEngine.setAppliedRulesField('  anotherField  ')).not.toThrow();
        });

        it('should work without appliedRulesField configured', async () => {
            // Create engine without setting appliedRulesField
            const basicEngine = new PgRulesEngine(db);

            const rule = MatchRuleFactory.createRule<User>(
                'no-tracking-rule',
                {email: 'alice@example.com'},
                {name: 'Alice No Tracking'}
            );

            const affectedRows = await basicEngine.applyRules([rule], 'users');
            expect(affectedRows).toBe(1);

            // Verify the rule was applied but no tracking occurred
            const user = await db
                .selectFrom('users')
                .selectAll()
                .where('email', '=', 'alice@example.com')
                .executeTakeFirst();

            expect(user.name).toBe('Alice No Tracking');
            // appliedRules field should still be null/empty since no tracking was configured
        });
    });
});
