# pg-rules

PostgreSQL based rule engine

## Features / Roadmap

- [x] Direct rule execution on PostgreSQL
- [x] Define rules in `regexp` conditions
- [ ] Support `more` or `less` predicators for integers
- [ ] Stop processing other rules option if rule matched

### How it works?

1. Data is copied to *Results table from the target table
2. Rules are transformed into SQL queries using `kysely`
3. Queries are executed in the database based on match conditions: `UPDATE {results_table} SET {apply} WHERE {match}`
4. All queries are executed in a single transaction

## Installation

```bash
npm install pg-rules kysely pg
```

## Usage

### Basic Setup

```typescript
import {RulesService} from 'pg-rules';
import {MatchRuleFactory} from 'pg-rules/entities/MatchRuleFactory';
import {Kysely, PostgresDialect} from 'kysely';
import {Pool} from 'pg';

// Initialize Kysely with your PostgreSQL connection
const db = new Kysely({
    dialect: new PostgresDialect({...})
});

// Create the rules service
const rulesService = new RulesService(db);
```

### Creating Rules

Rules are defined using the `MatchRule` interface with the following properties:

- `ruleName`: Unique identifier for the rule
- `match`: Conditions to match records (supports regex for strings)
- `apply`: Changes to apply to matched records
- `priority`: Execution order (lower numbers execute first, default: 0)
- `stopProcessingOtherRules`: Stop processing if this rule matches (not yet implemented)

```typescript
// Using MatchRuleFactory for convenience
const rules = MatchRuleFactory.createRules([
    {
        ruleName: 'promote-verified-users',
        priority: 1,
        match: {isVerified: true},
        apply: {role: 'premium'}
    },
    {
        ruleName: 'admin-privileges',
        priority: 2,
        match: {role: 'admin'},
        apply: {permissions: 'all'}
    }
]);

```

### Processing Rules

```typescript
// Process rules against a table
const affectedRows = await rulesService.processRules(rules, 'users');
console.log(`Processed ${affectedRows} records`);

// Results are stored in a table named "{original_table}_results"
// e.g., processing "users" table creates "users_results" table
const results = await db
    .selectFrom('users_results')
    .selectAll()
    .execute();
```

## API Reference

### RulesService

- `constructor(db: Kysely<any>)`: Initialize with Kysely database instance
- `processRules(rules: MatchRule[], targetTableName: string): Promise<number>`: Process rules and return affected row
  count
- `doPreProcessRules(resultsTableName: string): Promise<void>`: Override for custom pre-processing

### MatchRuleFactory

- `create<T>(json: any): MatchRule<T>`: Create a single rule from object
- `createRule<T>(ruleName, match, apply, priority?): MatchRule<T>`: Create rule with parameters
- `createRules<T>(rules: any[]): MatchRule<T>[]`: Create multiple rules from array

## Maintenance

```bash
# Check for outdated dependencies
ncu

# Update dependencies
ncu -u
```

## Development

### Install the latest Node.js version

```bash
# Install latest Node.js 24.x
nvm install 24

# Set it as the active version for this shell
nvm use 24

# Optionally make it the default for all new shells
nvm alias default 24
```

### Testing

- Quick SQLite Tests: `npm test`

- PostgreSQL Tests: ensure PostgreSQL is running and accessible `docker compose up -d`. 
Run PostgreSQL tests: `npm test:pg`