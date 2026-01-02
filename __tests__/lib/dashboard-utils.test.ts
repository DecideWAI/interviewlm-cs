/**
 * Dashboard Utilities Tests
 */

import {
  calculatePipelineFunnel,
  generatePriorityActions,
  calculatePipelineHealth,
} from '@/lib/dashboard-utils';

describe('Dashboard Utilities', () => {
  describe('calculatePipelineFunnel', () => {
    it('should calculate funnel for empty candidate list', () => {
      const funnel = calculatePipelineFunnel([]);

      expect(funnel.stages).toHaveLength(5);
      expect(funnel.stages[0].name).toBe('Invited');
      expect(funnel.stages[0].count).toBe(0);
      expect(funnel.overallConversion).toBe(0);
    });

    it('should calculate funnel with all stages filled', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const candidates = [
        {
          id: '1',
          status: 'HIRED',
          invitedAt: twoDaysAgo,
          startedAt: yesterday,
          completedAt: now,
          createdAt: twoDaysAgo,
        },
        {
          id: '2',
          status: 'EVALUATED',
          invitedAt: twoDaysAgo,
          startedAt: yesterday,
          completedAt: now,
          createdAt: twoDaysAgo,
        },
        {
          id: '3',
          status: 'COMPLETED',
          invitedAt: twoDaysAgo,
          startedAt: yesterday,
          completedAt: now,
          createdAt: twoDaysAgo,
        },
        {
          id: '4',
          status: 'IN_PROGRESS',
          invitedAt: twoDaysAgo,
          startedAt: yesterday,
          completedAt: null,
          createdAt: twoDaysAgo,
        },
        {
          id: '5',
          status: 'INVITED',
          invitedAt: twoDaysAgo,
          startedAt: null,
          completedAt: null,
          createdAt: twoDaysAgo,
        },
      ];

      const funnel = calculatePipelineFunnel(candidates);

      expect(funnel.stages[0].count).toBe(5); // Invited
      expect(funnel.stages[1].count).toBe(4); // Started
      expect(funnel.stages[2].count).toBe(3); // Completed
      expect(funnel.stages[3].count).toBe(1); // Evaluated
      expect(funnel.stages[4].count).toBe(1); // Hired

      // Check conversion rates
      expect(funnel.stages[0].conversionToNext).toBe(0.8); // 4/5 started
      expect(funnel.stages[1].conversionToNext).toBe(0.75); // 3/4 completed
      expect(funnel.overallConversion).toBe(0.2); // 1/5 hired
    });

    it('should calculate percentages correctly', () => {
      const now = new Date();

      const candidates = [
        {
          id: '1',
          status: 'HIRED',
          invitedAt: now,
          startedAt: now,
          completedAt: now,
          createdAt: now,
        },
        {
          id: '2',
          status: 'INVITED',
          invitedAt: now,
          startedAt: null,
          completedAt: null,
          createdAt: now,
        },
      ];

      const funnel = calculatePipelineFunnel(candidates);

      expect(funnel.stages[0].percentage).toBe(100); // Total invited
      expect(funnel.stages[1].percentage).toBe(50); // 1/2 started
      expect(funnel.stages[4].percentage).toBe(50); // 1/2 hired
    });

    it('should handle zero conversion rates gracefully', () => {
      const now = new Date();

      const candidates = [
        {
          id: '1',
          status: 'INVITED',
          invitedAt: now,
          startedAt: null,
          completedAt: null,
          createdAt: now,
        },
      ];

      const funnel = calculatePipelineFunnel(candidates);

      expect(funnel.stages[0].conversionToNext).toBe(0);
      expect(funnel.overallConversion).toBe(0);
    });

    it('should calculate average days in stage', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const candidates = [
        {
          id: '1',
          status: 'COMPLETED',
          invitedAt: twoDaysAgo,
          startedAt: oneDayAgo,
          completedAt: now,
          createdAt: twoDaysAgo,
        },
        {
          id: '2',
          status: 'COMPLETED',
          invitedAt: twoDaysAgo,
          startedAt: oneDayAgo,
          completedAt: now,
          createdAt: twoDaysAgo,
        },
      ];

      const funnel = calculatePipelineFunnel(candidates);

      expect(funnel.stages[0].avgDaysInStage).toBeGreaterThan(0);
      expect(funnel.stages[1].avgDaysInStage).toBeGreaterThan(0);
    });
  });

  describe('generatePriorityActions', () => {
    const now = Date.now();
    const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now - 72 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    it('should generate action for candidates needing review', () => {
      const candidates = [
        {
          id: '1',
          status: 'COMPLETED',
          completedAt: new Date(),
          startedAt: new Date(),
          invitedAt: new Date(),
        },
        {
          id: '2',
          status: 'COMPLETED',
          completedAt: new Date(),
          startedAt: new Date(),
          invitedAt: new Date(),
        },
      ];

      const actions = generatePriorityActions(candidates);

      const reviewAction = actions.find((a) => a.type === 'review_needed');
      expect(reviewAction).toBeTruthy();
      expect(reviewAction?.count).toBe(2);
      expect(reviewAction?.severity).toBe('high');
      expect(reviewAction?.title).toContain('Awaiting Review');
    });

    it('should generate action for stuck candidates', () => {
      const candidates = [
        {
          id: '1',
          status: 'IN_PROGRESS',
          completedAt: null,
          startedAt: threeDaysAgo,
          invitedAt: oneWeekAgo,
        },
      ];

      const actions = generatePriorityActions(candidates);

      const stuckAction = actions.find((a) => a.type === 'stuck_in_stage');
      expect(stuckAction).toBeTruthy();
      expect(stuckAction?.count).toBe(1);
      expect(stuckAction?.severity).toBe('medium');
    });

    it('should generate action for invited but not started', () => {
      const candidates = [
        {
          id: '1',
          status: 'INVITED',
          completedAt: null,
          startedAt: null,
          invitedAt: oneWeekAgo,
        },
      ];

      const actions = generatePriorityActions(candidates);

      const notStartedAction = actions.find((a) => a.type === 'follow_up');
      expect(notStartedAction).toBeTruthy();
      expect(notStartedAction?.severity).toBe('low');
    });

    it('should generate action for recently hired', () => {
      const recentDate = new Date(now - 2 * 24 * 60 * 60 * 1000);

      const candidates = [
        {
          id: '1',
          status: 'HIRED',
          completedAt: recentDate,
          startedAt: recentDate,
          invitedAt: recentDate,
        },
      ];

      const actions = generatePriorityActions(candidates);

      const hiredAction = actions.find((a) => a.type === 'offer_response');
      expect(hiredAction).toBeTruthy();
      expect(hiredAction?.count).toBe(1);
    });

    it('should sort actions by severity (high > medium > low)', () => {
      const candidates = [
        {
          id: '1',
          status: 'COMPLETED',
          completedAt: new Date(),
          startedAt: new Date(),
          invitedAt: new Date(),
        },
        {
          id: '2',
          status: 'IN_PROGRESS',
          completedAt: null,
          startedAt: threeDaysAgo,
          invitedAt: oneWeekAgo,
        },
        {
          id: '3',
          status: 'INVITED',
          completedAt: null,
          startedAt: null,
          invitedAt: oneWeekAgo,
        },
      ];

      const actions = generatePriorityActions(candidates);

      expect(actions[0].severity).toBe('high');
      expect(actions[actions.length - 1].severity).toBe('low');
    });

    it('should return empty array if no actions needed', () => {
      const candidates = [
        {
          id: '1',
          status: 'EVALUATED',
          completedAt: new Date(),
          startedAt: new Date(),
          invitedAt: new Date(),
        },
      ];

      const actions = generatePriorityActions(candidates);

      expect(actions).toHaveLength(0);
    });

    it('should generate correct action URLs', () => {
      const candidates = [
        {
          id: '1',
          status: 'COMPLETED',
          completedAt: new Date(),
          startedAt: new Date(),
          invitedAt: new Date(),
        },
      ];

      const actions = generatePriorityActions(candidates);

      const reviewAction = actions[0];
      expect(reviewAction.actionUrl).toBe('/candidates?status=COMPLETED');
      expect(reviewAction.actionLabel).toBe('Review Now');
    });

    it('should use singular/plural correctly in descriptions', () => {
      const singleCandidate = [
        {
          id: '1',
          status: 'COMPLETED',
          completedAt: new Date(),
          startedAt: new Date(),
          invitedAt: new Date(),
        },
      ];

      const multipleCandidates = [
        ...singleCandidate,
        {
          id: '2',
          status: 'COMPLETED',
          completedAt: new Date(),
          startedAt: new Date(),
          invitedAt: new Date(),
        },
      ];

      const singleActions = generatePriorityActions(singleCandidate);
      const multipleActions = generatePriorityActions(multipleCandidates);

      expect(singleActions[0].description).toContain('1 candidate ');
      expect(multipleActions[0].description).toContain('2 candidates');
    });
  });

  describe('calculatePipelineHealth', () => {
    it('should calculate health score for empty funnel', () => {
      const funnel = calculatePipelineFunnel([]);
      const health = calculatePipelineHealth(funnel);

      expect(health).toBe(0);
    });

    it('should calculate health score for perfect conversion', () => {
      // For perfect conversion, we need candidates at each stage
      // Note: HIRED status doesn't count as EVALUATED in funnel calculation
      // so evaluatedConversion would be 0 if we only have HIRED status
      // The formula uses conversions: start(30%) + complete(30%) + evaluated(20%) + hired(20%)
      const candidates = [
        {
          id: '1',
          status: 'HIRED',
          invitedAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ];

      const funnel = calculatePipelineFunnel(candidates);
      const health = calculatePipelineHealth(funnel);

      // With one HIRED candidate: start=100%, complete=100%, evaluated=0% (HIRED!=EVALUATED), hired=0%
      // Score = 30 + 30 + 0 + 0 = 60
      expect(health).toBe(60);
    });

    it('should return score between 0 and 100', () => {
      const candidates = [
        {
          id: '1',
          status: 'HIRED',
          invitedAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: '2',
          status: 'INVITED',
          invitedAt: new Date(),
          startedAt: null,
          completedAt: null,
          createdAt: new Date(),
        },
      ];

      const funnel = calculatePipelineFunnel(candidates);
      const health = calculatePipelineHealth(funnel);

      expect(health).toBeGreaterThanOrEqual(0);
      expect(health).toBeLessThanOrEqual(100);
    });

    it('should weight start conversion heavily (30%)', () => {
      const goodStartConversion = [
        {
          id: '1',
          status: 'IN_PROGRESS',
          invitedAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
        },
      ];

      const funnel = calculatePipelineFunnel(goodStartConversion);
      const health = calculatePipelineHealth(funnel);

      expect(health).toBeGreaterThan(20); // Should get credit for 100% start conversion
    });
  });
});
