import {Kysely, sql} from 'kysely';
import {MatchRule} from "@/MatchRule";

/**
 * PostgreSQL based rule engine that applies match rules to database tables.
 * applyRules is the main method to apply multiple rules in a single transaction.
 * applyRules always applied given rules without considering previously applied rules.
 */
export class PgRulesEngine {

    /**
     * Additional field name in the target table to track applied rules.
     * For example, appliedRulesField can be set to "appliedRules TEXT[]", then applied rule
     * will be added to the JSON array in this field. Specified "appliedRules TEXT[]" must be a PostgreSQL TEXT array type.
     *
     * @private
     */
    private appliedRulesField: string | null = null;

    constructor(private db: Kysely<any>) {
    }

    /**
     * Set the field name to track applied rules
     * @param fieldName Name of the field to store applied rules
     */
    setAppliedRulesField(fieldName: string): void {
        this.appliedRulesField = fieldName.trim();
    }

    /**
     * Apply multiple rules to a target table in a single transaction
     * @param rules Array of MatchRule objects to apply
     * @param targetTable Name of the table to apply rules to
     * @returns Promise that resolves to the total number of affected rows
     */
    async applyRules<T>(rules: MatchRule<T>[], targetTable: string): Promise<number> {
        if (!rules.length) {
            return 0;
        }

        return await this.db.transaction().execute(async (trx) => {
            let totalAffectedRows = 0;

            for (const rule of rules) {
                // Build the update query
                let query = trx.updateTable(targetTable);

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
                        // Use PostgreSQL regex operator for case-sensitive string matching
                        //query = query.where(sql.ref(key), '~', value);
                        query = query.where(sql<boolean>`regexp_like(${sql.ref(key)}, ${sql.val(value)})`)
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