import {Kysely} from 'kysely';
import {MatchRule} from "@/MatchRule";

/**
 * PostgreSQL based rule engine that applies match rules to database tables
 */
export class PgRulesEngine {
  constructor(private db: Kysely<any>) {}

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
          continue; // Skip rules with no apply changes
        }

        query = query.set(rule.apply);

        // Add WHERE clause from match object
        const matchEntries = Object.entries(rule.match);
        for (const [key, value] of matchEntries) {
          query = query.where(key, '=', value);
        }

        // Execute the query and get affected row count
        const result = await query.execute();
        // Kysely's execute() returns UpdateResult[], we need the first result's numUpdatedRows
        totalAffectedRows += Number(result[0]?.numUpdatedRows || 0);
      }

      return totalAffectedRows;
    });
  }
}