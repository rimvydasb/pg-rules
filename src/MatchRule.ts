/**
 * Represents a match rule that can be applied to database records
 */
export interface MatchRule<T = any> {
    readonly ruleName: string;
    readonly match: Partial<T>;
    readonly apply: Partial<T>;
}

