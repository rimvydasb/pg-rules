import { Calculator, greet } from './index';

describe('Calculator', () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  describe('add', () => {
    it('should add two positive numbers correctly', () => {
      expect(calculator.add(2, 3)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(calculator.add(-2, 3)).toBe(1);
    });
  });

  describe('subtract', () => {
    it('should subtract two numbers correctly', () => {
      expect(calculator.subtract(5, 3)).toBe(2);
    });

    it('should handle negative results', () => {
      expect(calculator.subtract(3, 5)).toBe(-2);
    });
  });

  describe('multiply', () => {
    it('should multiply two numbers correctly', () => {
      expect(calculator.multiply(3, 4)).toBe(12);
    });

    it('should handle zero multiplication', () => {
      expect(calculator.multiply(5, 0)).toBe(0);
    });
  });

  describe('divide', () => {
    it('should divide two numbers correctly', () => {
      expect(calculator.divide(10, 2)).toBe(5);
    });

    it('should throw error when dividing by zero', () => {
      expect(() => calculator.divide(10, 0)).toThrow('Division by zero is not allowed');
    });
  });
});

describe('greet', () => {
  it('should return a greeting message', () => {
    expect(greet('World')).toBe('Hello, World!');
  });

  it('should handle empty string', () => {
    expect(greet('')).toBe('Hello, !');
  });
});
