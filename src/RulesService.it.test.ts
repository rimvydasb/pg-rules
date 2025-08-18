import {RulesService} from './RulesService';
import {createTestDb} from './test/test-database';
import {MatchRuleFactory} from './entities/MatchRuleFactory';
import {Kysely} from 'kysely';
import {Database, User, NewUser} from './test/database.types';

const TEST_USERS: NewUser[] = [
    {
        email: 'john@example.com',
        name: 'John Doe',
        role: 'user',
        status: 'active',
        age: 30,
        priority: 1,
        isVerified: true,
        phone: '+1234567890'
    },
    {
        email: 'jane@example.com',
        name: 'Jane Smith',
        role: 'admin',
        status: 'active',
        age: 25,
        priority: 2,
        isVerified: false,
        phone: '+1234567891'
    },
    {
        email: 'bob@example.com',
        name: 'Bob Johnson',
        role: 'user',
        status: 'inactive',
        age: 35,
        priority: 3,
        isVerified: true,
        phone: '+1234567892'
    },
    {
        email: 'alice@example.com',
        name: 'Alice Brown',
        role: 'moderator',
        status: 'active',
        age: 28,
        priority: 1,
        isVerified: true,
        phone: '+1234567893'
    },
    {
        email: 'charlie@example.com',
        name: 'Charlie Wilson',
        role: 'user',
        status: 'pending',
        age: 22,
        priority: 5,
        isVerified: false,
        phone: '+1234567894'
    }
]

const describeIfPg = process.env.USE_PG_TESTS ? describe : describe.skip;

describeIfPg('RulesService - Real Database Integration Tests', () => {
    let db: Kysely<Database>;
    let rulesService: RulesService;

    beforeAll(async () => {
        db = await createTestDb();
        rulesService = new RulesService(db);
    }, 30000); // 30 second timeout for database setup

    afterAll(async () => {
        await db.destroy();
    });

    beforeEach(async () => {
        // Clean tables before each test
        await db.deleteFrom('posts').execute();
        await db.deleteFrom('users').execute();

        // Insert test data
        await db
            .insertInto('users')
            .values(TEST_USERS)
            .execute();
    });

    describe('procesRules', () => {
        it('should process a single rule and return the number of affected rows', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'promote-verified-users',
                    match: { isVerified: true },
                    apply: { role: 'premium' }
                }
            ]);

            const affectedRows = await rulesService.processRules(rules, 'users');

            expect(affectedRows).toBe(3); // John, Bob, and Alice are verified

            // Verify the results table was created and populated
            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .where('role', '=', 'premium')
                .execute();

            expect(results).toHaveLength(3);
            expect(results.map(u => u.email).sort()).toEqual([
                'alice@example.com',
                'bob@example.com',
                'john@example.com'
            ]);
        });

        it('should process multiple rules with different priorities', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'high-priority-boost',
                    priority: 1,
                    match: { priority: 1 },
                    apply: { status: 'vip' }
                },
                {
                    ruleName: 'admin-special-treatment',
                    priority: 2,
                    match: { role: 'admin' },
                    apply: { status: 'super-admin' }
                },
                {
                    ruleName: 'young-user-discount',
                    priority: 3,
                    match: { age: 25 },
                    apply: { priority: 0 }
                }
            ]);

            const affectedRows = await rulesService.processRules(rules, 'users');

            expect(affectedRows).toBe(4); // John (priority 1), Alice (priority 1), Jane (admin), Jane (age 25)

            // Check results table
            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .orderBy('email')
                .execute();

            // Alice and John should have status 'vip' (priority 1 rule)
            const vipUsers = results.filter(u => u.status === 'vip');
            expect(vipUsers).toHaveLength(2);
            expect(vipUsers.map(u => u.email).sort()).toEqual(['alice@example.com', 'john@example.com']);

            // Jane should have status 'super-admin' (admin role rule)
            const adminUser = results.find(u => u.email === 'jane@example.com');
            expect(adminUser?.status).toBe('super-admin');
        });

        it('should handle regex matching in rules', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'email-domain-rule',
                    match: { email: '.*@example\\.com' },
                    apply: { status: 'verified-domain' }
                }
            ]);

            const affectedRows = await rulesService.processRules(rules, 'users');

            expect(affectedRows).toBe(TEST_USERS.length); // All test users have @example.com emails

            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .where('status', '=', 'verified-domain')
                .execute();

            expect(results).toHaveLength(TEST_USERS.length);
        });

        it('should handle multiple conditions in match criteria', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'active-admin-boost',
                    match: {
                        role: 'admin',
                        status: 'active'
                    },
                    apply: { priority: 0 }
                }
            ]);

            const affectedRows = await rulesService.processRules(rules, 'users');

            expect(affectedRows).toBe(1); // Only Jane matches both conditions

            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .where('priority', '=', 0)
                .execute();

            expect(results).toHaveLength(1);
            expect(results[0].email).toBe('jane@example.com');
        });

        it('should handle empty rules array', async () => {
            const affectedRows = await rulesService.processRules([], 'users');

            expect(affectedRows).toBe(0);

            // Results table should still be created but empty
            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .execute();

            expect(results).toHaveLength(TEST_USERS.length);
        });

        it('should handle rules that match no records', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'no-match-rule',
                    match: { email: 'nonexistent@example.com' },
                    apply: { status: 'updated' }
                }
            ]);

            const affectedRows = await rulesService.processRules(rules, 'users');

            expect(affectedRows).toBe(0);

            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .execute();

            expect(results).toHaveLength(TEST_USERS.length);
        });

        it('should handle complex rule combinations', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'inactive-user-cleanup',
                    priority: 1,
                    match: { status: 'inactive' },
                    apply: { role: 'suspended', priority: 999 }
                },
                {
                    ruleName: 'pending-user-activation',
                    priority: 2,
                    match: { status: 'pending' },
                    apply: { status: 'active', isVerified: true }
                },
                {
                    ruleName: 'high-age-seniority',
                    priority: 3,
                    match: { age: 35 },
                    apply: { role: 'senior' }
                }
            ]);

            const affectedRows = await rulesService.processRules(rules, 'users');

            expect(affectedRows).toBe(3); // Bob (inactive), Charlie (pending), Bob again (age 35)

            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .orderBy('email')
                .execute();

            // Bob should have role 'senior' (last rule applied) and priority 999 (first rule)
            const bobResult = results.find(u => u.email === 'bob@example.com');
            expect(bobResult?.role).toBe('senior'); // Last rule wins for role
            expect(bobResult?.priority).toBe(999); // From first rule

            // Charlie should be activated
            const charlieResult = results.find(u => u.email === 'charlie@example.com');
            expect(charlieResult?.status).toBe('active');
            expect(charlieResult?.isVerified).toBe(true);
        });

        it('should preserve original data in results table', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'simple-update',
                    match: { email: 'john@example.com' },
                    apply: { status: 'updated' }
                }
            ]);

            await rulesService.processRules(rules, 'users');

            const result = await db
                .selectFrom('users_results')
                .selectAll()
                .where('email', '=', 'john@example.com')
                .executeTakeFirst();

            expect(result).toBeDefined();
            expect(result?.name).toBe('John Doe'); // Original data preserved
            expect(result?.age).toBe(30); // Original data preserved
            expect(result?.phone).toBe('+1234567890'); // Original data preserved
            expect(result?.status).toBe('updated'); // Rule applied
        });

        it('should handle boolean field updates correctly', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'verify-all-users',
                    match: { role: 'user' },
                    apply: { isVerified: true }
                }
            ]);

            const affectedRows = await rulesService.processRules(rules, 'users');

            expect(affectedRows).toBe(3); // John, Bob, Charlie are users

            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .where('role', '=', 'user')
                .execute();

            expect(results).toHaveLength(3);
            results.forEach(user => {
                expect(user.isVerified).toBe(true);
            });
        });

        it('should handle numeric field updates correctly', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'boost-priority',
                    match: { status: 'active' },
                    apply: { priority: 10 }
                }
            ]);

            const affectedRows = await rulesService.processRules(rules, 'users');

            expect(affectedRows).toBe(4);

            const results = await db
                .selectFrom('users_results')
                .selectAll()
                .where('status', '=', 'active')
                .execute();

            expect(results).toHaveLength(3);
            results.forEach(user => {
                expect(user.priority).toBe(10);
            });
        });
    });

    describe('Error handling', () => {
        xit('should handle database connection errors gracefully', async () => {
            // Create a service with invalid database connection
            const invalidDb = await createTestDb();
            await invalidDb.destroy(); // Close the connection

            const invalidService = new RulesService(invalidDb);
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'test-rule',
                    match: { email: 'test@example.com' },
                    apply: { status: 'test' }
                }
            ]);

            await expect(invalidService.processRules(rules, 'users'))
                .rejects
                .toThrow();
        });

        it('should handle invalid table names', async () => {
            const rules = MatchRuleFactory.createRules([
                {
                    ruleName: 'test-rule',
                    match: { email: 'test@example.com' },
                    apply: { status: 'test' }
                }
            ]);

            await expect(rulesService.processRules(rules, 'nonexistent_table'))
                .rejects
                .toThrow();
        });
    });
});
