import { createTestDatabase } from './test-database';

describe('Simple pg-mem test', () => {
  it('should create an in-memory database', () => {
    const db = createTestDatabase();
    expect(db).toBeDefined();
  });
});
