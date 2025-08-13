/**
 * Represents a match rule that can be applied to database records
 */
export interface MatchRule<T = any> {

    /**
     * Priority of the rule.
     * Rules with lower priority numbers will be applied first.
     * If not specified, the default priority is 0.
     */
    readonly priority: number;

    /**
     * Name of the rule, used for identification and logging.
     * Rule name can be added to "appliedRules" field in the database to track which rules were applied.
     */
    readonly ruleName: string;

    /**
     * Conditions to match records against.
     * Values will be matched as regex patterns if they are strings
     * and direct equality for other types.
     * For example, { "category": "Groceries|Food" } will match records where category is either "Groceries" or "Food".
     */
    readonly match: Partial<T>;

    /**
     * Changes to apply to matched records.
     * This object will be used in the SET clause of the SQL UPDATE statement.
     */
    readonly apply: Partial<T>;

    /**
     * No further rules will be applied if this rule result is true.
     */
    readonly stopProcessingOtherRules: boolean;
}
