import { MatchRule } from './MatchRule';
import { User } from './database.types';
import {MatchRuleFactory} from "./MatchRuleFactory";

describe('MatchRuleFactory', () => {
  describe('create', () => {
    it('should create a MatchRule from valid JSON object', () => {
      const json = {
        ruleName: 'test-rule',
        match: { email: 'test@example.com' },
        apply: { name: 'Updated Name' }
      };

      const rule = MatchRuleFactory.create<User>(json);

      expect(rule.ruleName).toBe('test-rule');
      expect(rule.match).toEqual({ email: 'test@example.com' });
      expect(rule.apply).toEqual({ name: 'Updated Name' });
    });

    it('should trim whitespace from rule name', () => {
      const json = {
        ruleName: '  test-rule  ',
        match: { email: 'test@example.com' },
        apply: { name: 'Updated Name' }
      };

      const rule = MatchRuleFactory.create<User>(json);

      expect(rule.ruleName).toBe('test-rule');
    });

    it('should throw error for null or undefined input', () => {
      expect(() => MatchRuleFactory.create(null)).toThrow();
      expect(() => MatchRuleFactory.create(undefined)).toThrow();
    });

    it('should throw error for invalid rule name', () => {
      const json = {
        ruleName: '',
        match: { email: 'test@example.com' },
        apply: { name: 'Updated Name' }
      };

      expect(() => MatchRuleFactory.create(json)).toThrow('Rule name must be a non-empty string');
    });

    it('should throw error for non-string rule name', () => {
      const json = {
        ruleName: 123,
        match: { email: 'test@example.com' },
        apply: { name: 'Updated Name' }
      };

      expect(() => MatchRuleFactory.create(json)).toThrow('Rule name must be a non-empty string');
    });

    it('should handle missing match object with default empty object', () => {
      const json = {
        ruleName: 'test-rule',
        apply: { name: 'Updated Name' }
      };

      const rule = MatchRuleFactory.create(json);
      expect(rule.ruleName).toBe('test-rule');
      expect(rule.match).toEqual({});
      expect(rule.apply).toEqual({ name: 'Updated Name' });
    });

    it('should handle invalid match object with default empty object', () => {
      const json = {
        ruleName: 'test-rule',
        match: 'invalid',
        apply: { name: 'Updated Name' }
      };

      const rule = MatchRuleFactory.create(json);
      expect(rule.ruleName).toBe('test-rule');
      expect(rule.match).toEqual({});
      expect(rule.apply).toEqual({ name: 'Updated Name' });
    });

    it('should handle missing apply object with default empty object', () => {
      const json = {
        ruleName: 'test-rule',
        match: { email: 'test@example.com' }
      };

      const rule = MatchRuleFactory.create(json);
      expect(rule.ruleName).toBe('test-rule');
      expect(rule.match).toEqual({ email: 'test@example.com' });
      expect(rule.apply).toEqual({});
    });

    it('should handle invalid apply object with default empty object', () => {
      const json = {
        ruleName: 'test-rule',
        match: { email: 'test@example.com' },
        apply: 'invalid'
      };

      const rule = MatchRuleFactory.create(json);
      expect(rule.ruleName).toBe('test-rule');
      expect(rule.match).toEqual({ email: 'test@example.com' });
      expect(rule.apply).toEqual({});
    });
  });

  describe('createRule', () => {
    it('should create a MatchRule with direct parameters', () => {
      const rule = MatchRuleFactory.createRule<User>(
        'direct-rule',
        { email: 'test@example.com' },
        { name: 'Direct Update' }
      );

      expect(rule.ruleName).toBe('direct-rule');
      expect(rule.match).toEqual({ email: 'test@example.com' });
      expect(rule.apply).toEqual({ name: 'Direct Update' });
    });

    it('should trim whitespace from rule name', () => {
      const rule = MatchRuleFactory.createRule<User>(
        '  direct-rule  ',
        { email: 'test@example.com' },
        { name: 'Direct Update' }
      );

      expect(rule.ruleName).toBe('direct-rule');
    });

    it('should throw error for invalid rule name', () => {
      expect(() => MatchRuleFactory.createRule('', {}, {})).toThrow('Rule name must be a non-empty string');
      expect(() => MatchRuleFactory.createRule('   ', {}, {})).toThrow('Rule name must be a non-empty string');
      expect(() => MatchRuleFactory.createRule(null as any, {}, {})).toThrow('Rule name must be a non-empty string');
      expect(() => MatchRuleFactory.createRule(undefined as any, {}, {})).toThrow('Rule name must be a non-empty string');
      expect(() => MatchRuleFactory.createRule(123 as any, {}, {})).toThrow('Rule name must be a non-empty string');
    });

    it('should handle invalid match object with default empty object', () => {
      const rule1 = MatchRuleFactory.createRule('test', null as any, {});
      expect(rule1.match).toEqual({});

      const rule2 = MatchRuleFactory.createRule('test', 'invalid' as any, {});
      expect(rule2.match).toEqual({});

      const rule3 = MatchRuleFactory.createRule('test', undefined as any, {});
      expect(rule3.match).toEqual({});
    });

    it('should handle invalid apply object with default empty object', () => {
      const rule1 = MatchRuleFactory.createRule('test', {}, null as any);
      expect(rule1.apply).toEqual({});

      const rule2 = MatchRuleFactory.createRule('test', {}, 'invalid' as any);
      expect(rule2.apply).toEqual({});

      const rule3 = MatchRuleFactory.createRule('test', {}, undefined as any);
      expect(rule3.apply).toEqual({});
    });

    it('should handle complex match and apply objects', () => {
      const match = { email: 'test@example.com', name: 'John Doe' };
      const apply = { name: 'Jane Doe', email: 'jane@example.com' };

      const rule = MatchRuleFactory.createRule<User>('complex-rule', match, apply);

      expect(rule.ruleName).toBe('complex-rule');
      expect(rule.match).toEqual(match);
      expect(rule.apply).toEqual(apply);
    });
  });
});
