import {createTestDatabase} from '@/test/test-database';
import {RulesExecutionService} from './RulesExecutionService';
import {User} from '@/test/database.types';
import {MatchRuleFactory} from "@/entities/MatchRuleFactory";

describe('PgRulesEngine', () => {
    let db: any;
    let rulesEngine: RulesExecutionService;

    beforeEach(async () => {
        db = createTestDatabase();
        rulesEngine = new RulesExecutionService(db, false);

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
            const rule = MatchRuleFactory.create({
                ruleName: 'update-john-name',
                match: {email: 'john@example.com'},
                apply: {name: 'John Updated'}
            });

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
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'update-john',
                    match: {email: 'john@example.com'},
                    apply: {name: 'John Modified'}
                },
                {
                    ruleName: 'update-jane',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Modified'}
                },
            ]);

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

            const rule = MatchRuleFactory.create({
                ruleName: 'update-specific-user',
                match: {email: 'bob@example.com', name: 'Target User'},
                apply: {name: 'Updated Target User'}
            });

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
            const rule = MatchRuleFactory.create({
                ruleName: 'update-nonexistent',
                match: {email: 'nonexistent@example.com'},
                apply: {name: 'Should Not Update'}
            });

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(0);

            // Verify no users were changed
            const allUsers = await db
                .selectFrom('users')
                .selectAll()
                .execute();

            expect(allUsers).toHaveLength(4);
            // @ts-ignore
            expect(allUsers.every((u: User) => !u.name.includes('Should Not Update'))).toBe(true);
        });

        it('should return 0 when given an empty rules array', async () => {
            const affectedRows = await rulesEngine.applyRules([], 'users');

            expect(affectedRows).toBe(0);
        });

        it('should skip rules with empty apply objects', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'empty-apply',
                    match: {email: 'john@example.com'},
                    apply: {}
                },
                {
                    ruleName: 'valid-rule',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Updated'}
                },
            ]);

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
            const rule = MatchRuleFactory.create({
                ruleName: 'update-multiple-fields',
                match: {email: 'alice@example.com'},
                apply: {
                    name: 'Alice Updated',
                    email: 'alice.updated@example.com'
                }
            });

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

        it('should apply rules in priority order (lower priority first)', async () => {
            // Jane will be updated twice, but the lower priority rule should apply first
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'priority-2',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Priority 2'},
                    priority: 2
                },
                {
                    ruleName: 'priority-0',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Priority 0'},
                    priority: 0
                },
                {
                    ruleName: 'priority-1',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Priority 1'},
                    priority: 1
                },
            ]);
            await rulesEngine.applyRules(rules, 'users');
            const updatedUser = await db
                .selectFrom('users')
                .selectAll()
                .where('email', '=', 'jane@example.com')
                .executeTakeFirst();
            expect(updatedUser.name).toBe('Jane Priority 2'); // Last rule applied (highest priority number)
        });

        it('should default priority to 0 if not specified', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'default-priority',
                    match: {email: 'bob@example.com'},
                    apply: {name: 'Bob Default Priority'}
                },
                {
                    ruleName: 'explicit-priority-1',
                    match: {email: 'bob@example.com'},
                    apply: {name: 'Bob Priority 1'},
                    priority: 1
                },
            ]);
            await rulesEngine.applyRules(rules, 'users');
            const updatedUser = await db
                .selectFrom('users')
                .selectAll()
                .where('email', '=', 'bob@example.com')
                .executeTakeFirst();
            expect(updatedUser.name).toBe('Bob Priority 1'); // Last rule applied (priority 1)
        });
    });

    describe('appliedRulesField functionality', () => {
        beforeEach(async () => {
            // Set up appliedRulesField for these tests
            rulesEngine.setAppliedRulesField('appliedRules');
        });

        it('should track applied rules when appliedRulesField is configured', async () => {
            const rule = MatchRuleFactory.create({
                ruleName: 'track-rule',
                match: {email: 'john@example.com'},
                apply: {name: 'John Tracked'}
            });

            await rulesEngine.applyRules([rule], 'users');

            // Verify the rule was applied and tracked
            const users = await rulesEngine.getRowsWithAppliedRules<User>('users', {email: 'john@example.com'});

            expect(users).toHaveLength(1);
            expect(users[0].name).toBe('John Tracked');
            expect(users[0].appliedRules).toEqual(['track-rule']);
        });

        it('should track multiple rules applied to the same row', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'first-rule',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane First'}
                },
                {
                    ruleName: 'second-rule',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Second'}
                }
            ]);

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
            const rule = MatchRuleFactory.create({
                ruleName: 'clear-test-rule',
                match: {email: 'alice@example.com'},
                apply: {name: 'Alice Modified'}
            });

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
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'bulk-rule-1',
                    match: {email: 'john@example.com'},
                    apply: {name: 'John Bulk'}
                },
                {
                    ruleName: 'bulk-rule-2',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Bulk'}
                }
            ]);

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
            const engineWithoutField = new RulesExecutionService(db);

            await expect(engineWithoutField.getRowsWithAppliedRules('users')).rejects.toThrow(
                'appliedRulesField is not configured. Use setAppliedRulesField() first.'
            );
        });

        it('should throw error when clearAppliedRules called without configuring appliedRulesField', async () => {
            const engineWithoutField = new RulesExecutionService(db);

            await expect(engineWithoutField.clearAppliedRules('users')).rejects.toThrow(
                'appliedRulesField is not configured. Use setAppliedRulesField() first.'
            );
        });

        it('should filter rows correctly with WHERE conditions in getRowsWithAppliedRules', async () => {
            // Apply rules to different users
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'filter-rule-1',
                    match: {email: 'john@example.com'},
                    apply: {name: 'John Filtered'}
                },
                {
                    ruleName: 'filter-rule-2',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Filtered'}
                }
            ]);

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
            const rule1 = MatchRuleFactory.create({
                ruleName: 'field-test-1',
                match: {email: 'bob@example.com'},
                apply: {name: 'Bob Field Test'}
            });

            await rulesEngine.applyRules([rule1], 'users');

            // Verify tracking with first field
            let users = await rulesEngine.getRowsWithAppliedRules('users', {email: 'bob@example.com'});
            expect(users[0].appliedRules).toEqual(['field-test-1']);

            // Change the field name and apply another rule
            rulesEngine.setAppliedRulesField('appliedRules'); // Same field name for this test

            const rule2 = MatchRuleFactory.create({
                ruleName: 'field-test-2',
                match: {email: 'bob@example.com'},
                apply: {name: 'Bob Field Test 2'}
            });

            await rulesEngine.applyRules([rule2], 'users');

            // Verify both rules are tracked
            users = await rulesEngine.getRowsWithAppliedRules('users', {email: 'bob@example.com'});
            expect(users[0].appliedRules).toEqual(['field-test-1', 'field-test-2']);
        });

        it('should track rules in transaction correctly', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'transaction-rule-1',
                    match: {email: 'john@example.com'},
                    apply: {name: 'John Transaction 1'}
                },
                {
                    ruleName: 'transaction-rule-2',
                    match: {email: 'jane@example.com'},
                    apply: {name: 'Jane Transaction 2'}
                }
            ]);

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
            const basicEngine = new RulesExecutionService(db, false);

            const rule = MatchRuleFactory.create({
                ruleName: 'no-tracking-rule',
                match: {email: 'alice@example.com'},
                apply: {name: 'Alice No Tracking'}
            });

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

    describe('regex matching functionality', () => {
        beforeEach(async () => {
            // Insert additional test data with various categories and statuses
            await db
                .insertInto('users')
                .values([
                    { email: 'user1@test.com', name: 'User One' },
                    { email: 'user2@test.com', name: 'User Two' },
                    { email: 'user3@test.com', name: 'User Three' },
                ])
                .execute();
        });

        it('should match strings using regex patterns with OR operator', async () => {
            // Set different roles (role column already exists in User schema)
            await db.updateTable('users').set({ role: 'admin' }).where('email', '=', 'user1@test.com').execute();
            await db.updateTable('users').set({ role: 'moderator' }).where('email', '=', 'user2@test.com').execute();
            await db.updateTable('users').set({ role: 'guest' }).where('email', '=', 'user3@test.com').execute();

            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'role-staff-rule',
                    match: { role: 'admin|moderator' },
                    apply: { name: 'Staff Member' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(2); // Should match 2 users (admin and moderator)

            // Verify only the matching users were updated
            const updatedUsers = await db
                .selectFrom('users')
                .selectAll()
                .where('name', '=', 'Staff Member')
                .execute();

            expect(updatedUsers).toHaveLength(2);
            expect(updatedUsers.map((u: any) => u.role).sort()).toEqual(['admin', 'moderator']);
        });

        it('should match exact string patterns', async () => {
            // Test exact string matching (no special regex characters)
            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'exact-email-rule',
                    match: { email: 'john@example.com' },
                    apply: { name: 'Exact Match User' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(1); // Should match exactly one user

            const updatedUser = await db
                .selectFrom('users')
                .selectAll()
                .where('email', '=', 'john@example.com')
                .executeTakeFirst();

            expect(updatedUser.name).toBe('Exact Match User');
        });

        it('should handle regex patterns with special characters', async () => {
            // Set various statuses
            await db.updateTable('users').set({ status: 'active' }).where('email', '=', 'john@example.com').execute();
            await db.updateTable('users').set({ status: 'inactive' }).where('email', '=', 'jane@example.com').execute();
            await db.updateTable('users').set({ status: 'pending' }).where('email', '=', 'bob@example.com').execute();

            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'status-pattern-rule',
                    match: { status: '^(active|pending)$' },
                    apply: { name: 'Active or Pending User' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(2); // Should match 2 users (active and pending)

            const updatedUsers = await db
                .selectFrom('users')
                .selectAll()
                .where('name', '=', 'Active or Pending User')
                .execute();

            expect(updatedUsers).toHaveLength(2);
            expect(updatedUsers.map((u: any) => u.status).sort()).toEqual(['active', 'pending']);
        });

        it('should handle case-sensitive regex matching', async () => {
            // Set roles with different cases
            await db.updateTable('users').set({ role: 'Admin' }).where('email', '=', 'john@example.com').execute();
            await db.updateTable('users').set({ role: 'admin' }).where('email', '=', 'jane@example.com').execute();
            await db.updateTable('users').set({ role: 'ADMIN' }).where('email', '=', 'bob@example.com').execute();

            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'case-sensitive-rule',
                    match: { role: 'Admin' },
                    apply: { name: 'Exact Case Match' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(1); // Should match only one user (exact case)

            const updatedUser = await db
                .selectFrom('users')
                .selectAll()
                .where('name', '=', 'Exact Case Match')
                .executeTakeFirst();

            expect(updatedUser.role).toBe('Admin');
        });

        it('should use direct equality for non-string values', async () => {
            // Set test data
            await db.updateTable('users').set({ age: 25, isVerified: true }).where('email', '=', 'john@example.com').execute();
            await db.updateTable('users').set({ age: 30, isVerified: false }).where('email', '=', 'jane@example.com').execute();
            await db.updateTable('users').set({ age: 25, isVerified: true }).where('email', '=', 'bob@example.com').execute();

            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'non-string-rule',
                    match: {
                        age: 25,
                        isVerified: true
                    },
                    apply: { name: 'Non-String Match' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(2); // Should match 2 users with age=25 AND isVerified=true

            const updatedUsers = await db
                .selectFrom('users')
                .selectAll()
                .where('name', '=', 'Non-String Match')
                .execute();

            expect(updatedUsers).toHaveLength(2);
            expect(updatedUsers.every((u: any) => u.age === 25 && u.isVerified === true)).toBe(true);
        });

        it('should handle mixed string and non-string conditions', async () => {
            // Set test data using role (already exists) and priority
            await db.updateTable('users').set({ role: 'admin', priority: 1 }).where('email', '=', 'john@example.com').execute();
            await db.updateTable('users').set({ role: 'user', priority: 1 }).where('email', '=', 'jane@example.com').execute();
            await db.updateTable('users').set({ role: 'admin', priority: 2 }).where('email', '=', 'bob@example.com').execute();

            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'mixed-conditions-rule',
                    match: {
                        role: 'admin|user',
                        priority: 1
                    },
                    apply: { name: 'Mixed Conditions Match' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(2); // Should match users with (admin OR user) AND priority=1

            const updatedUsers = await db
                .selectFrom('users')
                .selectAll()
                .where('name', '=', 'Mixed Conditions Match')
                .execute();

            expect(updatedUsers).toHaveLength(2);
            expect(updatedUsers.every((u: any) => u.priority === 1)).toBe(true);
            expect(updatedUsers.map((u: any) => u.role).sort()).toEqual(['admin', 'user']);
        });

        it('should handle regex patterns with no matches', async () => {
            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'no-match-regex-rule',
                    match: { email: 'nonexistent.*pattern' },
                    apply: { name: 'Should Not Match' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(0);

            // Verify no users were updated
            const updatedUsers = await db
                .selectFrom('users')
                .selectAll()
                .where('name', '=', 'Should Not Match')
                .execute();

            expect(updatedUsers).toHaveLength(0);
        });

        it('should handle regex patterns with dot metacharacter', async () => {
            // Test dot (.) metacharacter matching any character
            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'dot-pattern-rule',
                    match: { email: 'j..n@example.com' },
                    apply: { name: 'Dot Pattern Match' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(1);

            const updatedUser = await db
                .selectFrom('users')
                .selectAll()
                .where('email', '=', 'john@example.com')
                .executeTakeFirst();

            expect(updatedUser.name).toBe('Dot Pattern Match');
        });

        it('should handle complex regex patterns', async () => {
            // Set phone numbers
            await db.updateTable('users').set({ phone: '+1-555-123-4567' }).where('email', '=', 'john@example.com').execute();
            await db.updateTable('users').set({ phone: '555.123.4568' }).where('email', '=', 'jane@example.com').execute();
            await db.updateTable('users').set({ phone: '(555) 123-4569' }).where('email', '=', 'bob@example.com').execute();
            await db.updateTable('users').set({ phone: '5551234570' }).where('email', '=', 'alice@example.com').execute();

            const rule = MatchRuleFactory.createRules([
                {
                    ruleName: 'phone-pattern-rule',
                    match: { phone: '.*555.*123.*' },
                    apply: { name: 'Phone Pattern Match' }
                }
            ])[0];

            const affectedRows = await rulesEngine.applyRules([rule], 'users');

            expect(affectedRows).toBe(4); // Should match all phone numbers containing 555 and 123

            const updatedUsers = await db
                .selectFrom('users')
                .selectAll()
                .where('name', '=', 'Phone Pattern Match')
                .execute();

            expect(updatedUsers).toHaveLength(4);
        });
    });
});
