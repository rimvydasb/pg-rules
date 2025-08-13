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

1. Execute docker compose to start the test database:
   ```bash
   docker compose up -d
   ```

2. Run the tests:
   ```bash
    npm test
    ```