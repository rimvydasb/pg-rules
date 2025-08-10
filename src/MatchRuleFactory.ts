import {MatchRule} from "@/MatchRule";

export class MatchRuleFactory {
    /**
     * Creates a MatchRule instance from a rule object
     * @returns A new MatchRule instance
     * @param json
     */
    static create<T>(json: any): MatchRule<T> {
        if (!json || typeof json !== 'object') {
            throw new Error('Invalid rule object provided');
        }

        return MatchRuleFactory.createRule<T>(
            json.ruleName,
            json.match || {},
            json.apply || {}
        );
    }

    /**
     * Creates a MatchRule instance with direct parameters
     * @param ruleName The name of the rule
     * @param match The conditions to match
     * @param apply The changes to apply
     * @returns A new MatchRule instance
     */
    static createRule<T>(ruleName: string, match: Partial<T>, apply: Partial<T>): MatchRule<T> {
        if (!ruleName || typeof ruleName !== 'string' || ruleName.trim() === '') {
            throw new Error('Rule name must be a non-empty string');
        }

        return {
            ruleName: ruleName.trim(),
            match : (match && typeof match === 'object') ? match : {},
            apply : (apply && typeof apply === 'object') ? apply : {}
        };
    }
}