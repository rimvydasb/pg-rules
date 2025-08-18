import {Kysely, sql} from 'kysely';
import {MatchRule} from "@/entities/MatchRule";

/**
 * PostgreSQL based rule engine that applies match rules to database tables.
 * applyRules is the main method to apply multiple rules in a single transaction.
 * applyRules always applied given rules without considering previously applied rules.
 */
export class RulesExecutionService {

    /**
     * Additional field name in the target table to track applied rules.
     * For example, appliedRulesField can be set to "appliedRules TEXT[]", then applied rule
     * will be added to the JSON array in this field. Specified "appliedRules TEXT[]" must be a PostgreSQL TEXT array type.
     *
     * @private
     */
    private appliedRulesField: string | null = null;

    private readonly useRegexpOperators : boolean;

    private readonly db: Kysely<any>;

    constructor(db: Kysely<any>) {
        if (!db) {
            throw new Error('Database connection is required');
        }
        this.db = db;

        const adapterName = (db as any).getExecutor().adapter.constructor.name;
        this.useRegexpOperators =  adapterName === 'PostgresAdapter';
        if (!this.useRegexpOperators) {
            console.warn('Using regexp_like for string matching for ${adapterName}. This may affect performance.');
        }
    }

    /**
     * Set the field name to track applied rules
     * @param fieldName Name of the field to store applied rules
     */
    setAppliedRulesField(fieldName: string): void {
        this.appliedRulesField = fieldName.trim();
    }

    /**
     * Initialize the results table for rule application.
     * Creates {targetTable}Results if it does not exist, with the same schema as {targetTable} plus applied_rules.
     */
    private async createResultsTable(targetTableName: string, resultsTableName: string): Promise<void> {
        await sql`
            CREATE TABLE IF NOT EXISTS ${sql.ref(resultsTableName)}
            (
                LIKE          ${sql.ref(targetTableName)} INCLUDING ALL,
                applied_rules text [] NOT NULL DEFAULT '{}'
            )
        `.execute(this.db);
    }

    /**
     * Reset the results table and copy data from the original table.
     */
    private async initialiseResultsTableData(targetTableName: string, resultsTableName: string): Promise<void> {
        await sql`TRUNCATE
        ${sql.ref(resultsTableName)}`.execute(this.db);
        await this.db.insertInto(resultsTableName).expression(
            this.db.selectFrom(targetTableName).selectAll()
        ).execute();
    }

    async resetResultsTableIfExists(targetTableName: string): Promise<string> {
        const resultsTableName = `${targetTableName}Results`;
        await this.db.transaction().execute(async (trx) => {
            // Ensure results table exists and is initialized
            await this.createResultsTable(targetTableName, resultsTableName);
            await this.initialiseResultsTableData(targetTableName, resultsTableName);
        });
        return resultsTableName;
    }

    /**
     * Apply multiple rules to a target table's results copy in a single transaction
     * @param rules Array of MatchRule objects to apply
     * @param resultsTableName Name of the table to apply rules to
     * @returns Promise that resolves to the total number of affected rows
     */
    async applyRules<T>(rules: MatchRule<T>[], resultsTableName: string): Promise<number> {
        if (!rules.length) {
            return 0;
        }

        // Sort rules by priority (ascending)
        const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

        return await this.db.transaction().execute(async (trx) => {
            let totalAffectedRows = 0;

            for (const rule of sortedRules) {
                // Build the update query
                let query = trx.updateTable(resultsTableName);

                // Add SET clause from apply object
                const applyEntries = Object.entries(rule.apply);
                if (applyEntries.length === 0) {
                    console.warn(`Rule "${rule.ruleName}" has no apply changes, skipping...`);
                    continue; // Skip rules with no apply changes
                }

                // Start with the apply object changes
                const updateObject: Record<string, any> = {...rule.apply};

                // Add appliedRulesField tracking if configured
                if (this.appliedRulesField) {
                    if (this.useRegexpOperators) {
                        // PostgreSQL: Use jsonb operations with explicit type casting
                        updateObject[this.appliedRulesField] = sql`
                            COALESCE(${sql.ref(this.appliedRulesField)}, '[]'::jsonb)
                            || ${sql.val(JSON.stringify([rule.ruleName]))}::jsonb
                        `;
                    } else {
                        // SQLite: Use JSON_ARRAY_APPEND function (mocked in test setup)
                        updateObject[this.appliedRulesField] = sql`JSON_ARRAY_APPEND(COALESCE(${sql.ref(this.appliedRulesField)}, JSON_ARRAY()), '$', ${rule.ruleName})`;
                    }
                }

                query = query.set(updateObject);

                // Add WHERE clause from match object
                const matchEntries = Object.entries(rule.match);
                if (matchEntries.length === 0) {
                    console.warn(`Rule "${rule.ruleName}" has no match conditions, skipping...`);
                    continue; // Skip rules with no match conditions
                }

                for (const [key, value] of matchEntries) {
                    if (typeof value === 'string') {
                        // Use PostgresSQL regex operator for case-sensitive string matching
                        if (this.useRegexpOperators) {
                            query = query.where(sql.ref(key), '~', sql.val(value));
                        } else {
                            query = query.where(sql<boolean>`regexp_like(
                            ${sql.ref(key)},
                            ${sql.val(value)}
                            )`)
                        }
                    } else {
                        // Use direct equality for non-string types
                        query = query.where(sql.ref(key), '=', value);
                    }
                }

                // Execute the query and get affected row count
                const result = await query.execute();
                // Kysely's execute() returns UpdateResult[], we need the first result's numUpdatedRows
                totalAffectedRows += Number(result[0]?.numUpdatedRows || 0);
            }

            return totalAffectedRows;
        });
    }

    /**
     * Clear applied rules tracking for rows matching the given conditions
     * @param targetTable Name of the table to clear applied rules from
     * @param whereConditions Conditions to match rows (optional, clears all if not provided)
     * @returns Promise that resolves to the number of affected rows
     */
    async clearAppliedRules<T>(targetTable: string, whereConditions?: Partial<T>): Promise<number> {
        if (!this.appliedRulesField) {
            throw new Error('appliedRulesField is not configured. Use setAppliedRulesField() first.');
        }

        const updateObject: Record<string, any> = {};
        if (this.useRegexpOperators) {
            // PostgreSQL: Use empty JSON array
            updateObject[this.appliedRulesField] = sql`'[]'::jsonb`;
        } else {
            // SQLite: Use JSON_ARRAY() function (mocked in test setup)
            updateObject[this.appliedRulesField] = sql`JSON_ARRAY()`;
        }

        let query = this.db.updateTable(targetTable).set(updateObject);

        // Add WHERE conditions if provided
        if (whereConditions) {
            const matchEntries = Object.entries(whereConditions);
            for (const [key, value] of matchEntries) {
                query = query.where(key, '=', value);
            }
        }

        const result = await query.execute();
        return Number(result[0]?.numUpdatedRows || 0);
    }

    private normalizeAppliedRules(value: unknown): string[] {
        if (value == null) return [];
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    return parsed.map(v => String(v));
                }
                return [String(parsed)];
            } catch {
                return [value];
            }
        }
        if (Array.isArray(value)) {
            return value.map(v => String(v));
        }
        return [String(value)];
    }

    /**
     * Get rows with their applied rules
     * @param targetTable Name of the table to query
     * @param whereConditions Conditions to match rows (optional)
     * @returns Promise that resolves to an array of rows with applied rules
     */
    async getRowsWithAppliedRules<T>(targetTable: string, whereConditions?: Partial<T>): Promise<(T & {
        appliedRules?: string[]
    })[]> {
        if (!this.appliedRulesField) {
            throw new Error('appliedRulesField is not configured. Use setAppliedRulesField() first.');
        }

        let query = this.db.selectFrom(targetTable).selectAll();

        // Add WHERE conditions if provided
        if (whereConditions) {
            const matchEntries = Object.entries(whereConditions);
            for (const [key, value] of matchEntries) {
                query = query.where(key, '=', value);
            }
        }

        const rows = await query.execute();

        // Parse the applied rules JSON array for each row
        return rows.map(row => {
            const appliedRulesValue = (row as any)[this.appliedRulesField!];
            return {
                ...row,
                appliedRules: this.normalizeAppliedRules(appliedRulesValue),
            } as T & { appliedRules?: string[] };
        });
    }
}