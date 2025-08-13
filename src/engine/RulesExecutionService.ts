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

    private regexpOperatorsSupported = true;

    private db: Kysely<any>;

    constructor(db: Kysely<any>, regexpOperatorsSupported: boolean = true) {
        if (!db) {
            throw new Error('Database connection is required');
        }
        this.db = db;
        this.regexpOperatorsSupported = regexpOperatorsSupported;
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
                    // Use PostgreSQL's JSON_ARRAY_APPEND to add the rule name to the JSON array
                    /*language=TEXT*/
                    updateObject[this.appliedRulesField] = sql`JSON_ARRAY_APPEND(COALESCE(${sql.ref(this.appliedRulesField)}, JSON_ARRAY()), '$', ${rule.ruleName})`;
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
                        if (this.regexpOperatorsSupported) {
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
        /*language=TEXT*/
        updateObject[this.appliedRulesField] = sql`JSON_ARRAY()`;

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
        const normalizeOne = (v: unknown): string => {
            if (v == null) return '';

            // If it's already a JS string, try to JSON-parse it once to strip quotes
            if (typeof v === 'string') {
                // Fast path: JSON string literal like "\"track-rule\"" or '"track-rule"'
                if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
                    try {
                        return JSON.parse(v);
                    } catch { /* fall through */
                    }
                    return v.slice(1, -1);
                }
                // Could also be a JSON array/object as string (unlikely here but safe)
                try {
                    const parsed = JSON.parse(v);
                    if (typeof parsed === 'string') return parsed;     // '"track-rule"' -> track-rule
                    if (Array.isArray(parsed)) {
                        // If someone stored '["a","b"]' as a string, flatten one level
                        return parsed.map(x => String(x)).join(',');
                    }
                    return String(parsed);
                } catch {
                    return v; // plain string like 'track-rule'
                }
            }

            // If pg-mem gave us a JS scalar
            if (Array.isArray(v)) {
                // Shouldn't happen here (handled in outer branch), but guard anyway
                return v.map(x => String(x)).join(',');
            }
            return String(v);
        };

        if (value == null) return [];

        // pg-mem jsonb often arrives as real JS arrays
        if (Array.isArray(value)) {
            return value.map(normalizeOne);
        }

        // Single value paths: wrap into array
        return [normalizeOne(value)];
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