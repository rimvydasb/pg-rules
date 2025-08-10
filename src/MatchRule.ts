/**
 * Represents a match rule that can be applied to database records
 */
export class MatchRule<T = any> {
    public readonly ruleName: string;
    public readonly match: Partial<T>;
    public readonly apply: Partial<T>;

    constructor(ruleName: string, match: Partial<T>, apply: Partial<T>) {
        this.ruleName = ruleName;
        this.match = match;
        this.apply = apply;
    }
}