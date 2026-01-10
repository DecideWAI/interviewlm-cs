/**
 * Tests for evidence-linking type guards and validation functions
 */

import { isValidEvidence, safeParseEvidenceArray } from '@/lib/services/evidence-linking';

describe('isValidEvidence', () => {
  describe('valid evidence objects', () => {
    it('should return true for valid code_snippet evidence', () => {
      const evidence = {
        type: 'code_snippet',
        description: 'Implemented sorting algorithm',
        codeSnippet: 'function sort(arr) { return arr.sort(); }',
      };
      expect(isValidEvidence(evidence)).toBe(true);
    });

    it('should return true for valid test_result evidence', () => {
      const evidence = {
        type: 'test_result',
        description: 'All tests passing',
        testName: 'sort.test.ts',
        passed: true,
      };
      expect(isValidEvidence(evidence)).toBe(true);
    });

    it('should return true for valid ai_interaction evidence', () => {
      const evidence = {
        type: 'ai_interaction',
        description: 'Asked about algorithm complexity',
      };
      expect(isValidEvidence(evidence)).toBe(true);
    });

    it('should return true for valid terminal_command evidence', () => {
      const evidence = {
        type: 'terminal_command',
        description: 'Ran npm test',
        command: 'npm test',
      };
      expect(isValidEvidence(evidence)).toBe(true);
    });

    it('should return true for valid metric evidence', () => {
      const evidence = {
        type: 'metric',
        description: 'Code coverage at 85%',
        value: 85,
      };
      expect(isValidEvidence(evidence)).toBe(true);
    });
  });

  describe('invalid evidence objects', () => {
    it('should return false for null', () => {
      expect(isValidEvidence(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidEvidence(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isValidEvidence('string')).toBe(false);
      expect(isValidEvidence(123)).toBe(false);
      expect(isValidEvidence(true)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isValidEvidence({})).toBe(false);
    });

    it('should return false when type is missing', () => {
      const evidence = {
        description: 'Some description',
      };
      expect(isValidEvidence(evidence)).toBe(false);
    });

    it('should return false when description is missing', () => {
      const evidence = {
        type: 'code_snippet',
      };
      expect(isValidEvidence(evidence)).toBe(false);
    });

    it('should return false when type is not a string', () => {
      const evidence = {
        type: 123,
        description: 'Some description',
      };
      expect(isValidEvidence(evidence)).toBe(false);
    });

    it('should return false when description is not a string', () => {
      const evidence = {
        type: 'code_snippet',
        description: 123,
      };
      expect(isValidEvidence(evidence)).toBe(false);
    });

    it('should return false for invalid evidence type', () => {
      const evidence = {
        type: 'invalid_type',
        description: 'Some description',
      };
      expect(isValidEvidence(evidence)).toBe(false);
    });

    it('should return false for array', () => {
      expect(isValidEvidence([])).toBe(false);
    });
  });
});

describe('safeParseEvidenceArray', () => {
  it('should return empty array for non-array input', () => {
    expect(safeParseEvidenceArray(null)).toEqual([]);
    expect(safeParseEvidenceArray(undefined)).toEqual([]);
    expect(safeParseEvidenceArray('string')).toEqual([]);
    expect(safeParseEvidenceArray(123)).toEqual([]);
    expect(safeParseEvidenceArray({})).toEqual([]);
  });

  it('should return empty array for empty array input', () => {
    expect(safeParseEvidenceArray([])).toEqual([]);
  });

  it('should filter out invalid evidence objects', () => {
    const input = [
      { type: 'code_snippet', description: 'Valid' },
      { type: 'invalid', description: 'Invalid type' },
      { description: 'Missing type' },
      null,
      'string',
    ];
    const result = safeParseEvidenceArray(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'code_snippet', description: 'Valid' });
  });

  it('should return all valid evidence objects', () => {
    const input = [
      { type: 'code_snippet', description: 'Code evidence' },
      { type: 'test_result', description: 'Test evidence' },
      { type: 'ai_interaction', description: 'AI evidence' },
    ];
    const result = safeParseEvidenceArray(input);
    expect(result).toHaveLength(3);
  });

  it('should handle mixed valid and invalid objects', () => {
    const input = [
      { type: 'code_snippet', description: 'Valid 1' },
      {},
      { type: 'test_result', description: 'Valid 2' },
      { type: 123, description: 'Invalid type' },
      { type: 'metric', description: 'Valid 3' },
    ];
    const result = safeParseEvidenceArray(input);
    expect(result).toHaveLength(3);
    expect(result.map(e => e.type)).toEqual(['code_snippet', 'test_result', 'metric']);
  });
});
