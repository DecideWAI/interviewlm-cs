# Interview Agent Research Summary

**Research Date**: 2025-11-13
**Platform**: InterviewLM Technical Assessment System

---

## Quick Links

- **Full Architecture Report**: `./INTERVIEW_AGENT_ARCHITECTURE.md` (comprehensive 40+ page report)
- **Quick Start Guide**: `./INTERVIEW_AGENT_QUICK_START.md` (implementation steps)
- **Data Flow Diagrams**: `./INTERVIEW_AGENT_DATA_FLOWS.md` (visual examples)

---

## Executive Summary

Research findings confirm that building a background Interview Agent for adaptive technical assessments is **highly feasible** using modern multi-agent architectures. The recommended approach uses:

1. **Claude Agent SDK** with orchestrator-worker pattern
2. **Item Response Theory (IRT)** for psychometrically valid difficulty adjustment
3. **OpenTelemetry** for real-time monitoring and observability
4. **Question seeds** for controlled adaptive question generation
5. **Multi-layer context isolation** to keep Interview Agent completely hidden from candidates

---

## Key Research Findings

### 1. Multi-Agent Architecture Pattern

**Recommended**: **Hierarchical Orchestrator-Worker** pattern

```
Session Orchestrator (Parent)
    ├── Candidate Agent (Worker - Visible to candidate)
    └── Interview Agent (Worker - Background/Hidden)
```

**Key Sources**:
- Azure AI Architecture Center: AI Agent Orchestration Patterns (2024)
- Claude Agent SDK: Subagent memory isolation
- AWS Multi-Agent Orchestrator Framework (Dec 2024)

**Why it works**:
- **Proven at scale**: Used by Microsoft Azure, AWS, Google Cloud
- **Built-in isolation**: Subagents have separate context windows
- **Clear separation**: Each agent has distinct responsibilities and tools
- **Observable**: Native support for monitoring and tracing

---

### 2. Context Isolation Techniques

**Critical Requirement**: Interview Agent must NEVER leak information to candidate.

**5-Layer Isolation Strategy**:

1. **Network Layer**: Separate API endpoints (`/api/candidate/*` vs `/internal/assessment/*`)
2. **API Response Filtering**: Strip sensitive fields before returning to candidate
3. **Agent Context Isolation**: Separate Claude conversation IDs and system prompts
4. **Tool Access Control**: Non-overlapping tool sets for each agent
5. **Audit Logging**: Immutable logs to verify no leakage

**From Claude Agent SDK Documentation**:
> "Subagents maintain separate context from the main agent, preventing information overload and keeping interactions focused. Each agent maintains its own working memory for task execution."

**Verification**: Industry examples show this works at production scale (multi-agent systems from Anthropic, OpenAI, LangChain).

---

### 3. Adaptive Assessment - Item Response Theory (IRT)

**Key Discovery**: Classical psychometric theory (IRT) + Modern LLMs = Powerful adaptive testing

**IRT Core Concept**:
- **θ (theta)**: Candidate ability estimate (-3 to +3 scale)
- **b**: Question difficulty parameter (-3 to +3 scale)
- **Adaptive principle**: Present questions where b ≈ θ (maximizes information gain)

**Recent Research** (IEEE 2024):
- "Adaptive Question–Answer Generation With Difficulty Control Using Item Response Theory and Pretrained Transformer Models"
- Successfully demonstrated LLMs (T5, BERT) generating questions with target IRT parameters
- Duolingo English Test uses IRT + ML for adaptive language proficiency assessment

**Implementation**:
```typescript
// Simple IRT probability
P(correct | θ, b) = 1 / (1 + e^(-(θ - b)))

// Update ability after each response
θ_new = θ_old + α * (actual - expected)
```

**Benefits**:
- Converges to accurate ability estimate in 5-10 questions
- Psychometrically sound (scientific validity)
- Adapts in real-time based on performance

---

### 4. Question Seed System

**Inspired by**: Gaming's Dynamic Difficulty Adjustment (DDA) systems

**Concept**:
- Store "question seeds" (templates) with known difficulty parameters
- Generate variants dynamically using LLMs
- Control difficulty through multiple dimensions:
  - Conceptual complexity
  - Code scaffolding amount
  - Time pressure

**EA Patent on DDA** (relevant insights):
- Seeds map to difficulty levels
- Monitor user progress per seed
- Adjust future seed selection based on performance
- Optimize for engagement (balancing challenge and frustration)

**For InterviewLM**:
```typescript
interface QuestionSeed {
  id: string;
  topic: string;
  baseDifficulty: number;  // IRT parameter
  variants: QuestionVariant[];
}

// Dynamic generation
generateQuestion(seed, targetDifficulty) -> Question
```

---

### 5. Real-Time Monitoring

**Industry Standard**: OpenTelemetry for AI agent observability

**Key Platforms Supporting This**:
- **Langfuse**: AI agent observability with latency, cost, error tracking
- **Arize Phoenix**: LLM observability with drift detection
- **Azure AI Foundry**: End-to-end AI system monitoring
- **Claude Code**: Official OpenTelemetry support

**Metrics to Track**:
- `candidate_ability_theta` (current ability estimate)
- `current_difficulty_level` (question difficulty)
- `question_changes_total` (advancement count)
- `test_pass_rate` (performance over time)
- `ai_dependency_ratio` (candidate self-sufficiency)
- `code_quality_score` (syntax, style, patterns)

**Event-Driven Architecture**:
```
Candidate Activity → Event Stream → Interview Agent (Observer)
                                  ↓
                          OpenTelemetry Exporter
                                  ↓
                          Metrics Backend (Prometheus/InfluxDB)
                                  ↓
                          Dashboard (Grafana/Custom)
```

**Latency Requirements** (from research):
- Event processing: <100ms
- Difficulty adjustment: <2s
- Question generation: <5s
- Supports 100+ concurrent sessions

---

### 6. Background Agent Communication Pattern

**Key Finding**: Interview Agent uses **one-way observation** pattern

```
Candidate Actions → Event Stream → Interview Agent
                                         ↓
                                   Decisions/Recommendations
                                         ↓
                                   Orchestrator
                                         ↓
                                   Update Session State
                                         ↓
                                   Candidate sees filtered updates
```

**Critical**: Interview Agent NEVER directly responds to candidate
- No bidirectional communication
- Pure observer with decision-making capability
- Decisions route through orchestrator for filtering

**From Multi-Agent Research**:
- "Observer agents" are common in ambient/background systems
- Event-driven patterns enable asynchronous processing
- Prevents blocking candidate experience

---

## Architecture Recommendations

### Recommended Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Agent Framework** | Claude Agent SDK | Native subagent support, context isolation |
| **Orchestration** | Custom orchestrator with SDK | Control over routing and state |
| **Event Bus** | Redis Pub/Sub or WebSocket | Real-time, low latency |
| **Metrics DB** | InfluxDB or TimescaleDB | Time-series optimization |
| **Session Cache** | Redis | Fast access to current state |
| **Question Bank** | PostgreSQL | Relational queries, ACID compliance |
| **Monitoring** | OpenTelemetry + Grafana | Industry standard, Claude Code compatible |
| **Code Snapshots** | S3 | Scalable, cheap archival |

### Data Access Requirements

**Interview Agent Needs**:
- **Read**: Session events, performance metrics, question bank
- **Write**: Ability estimates, decisions, audit logs, metrics

**Interview Agent Does NOT Need**:
- Candidate conversation history (privacy + isolation)
- Candidate PII beyond session ID
- Direct candidate communication channel

---

## Critical Success Factors

Based on research into production multi-agent systems:

### 1. Absolute Context Isolation
- **Zero tolerance** for information leakage
- Multiple verification layers
- Automated testing of isolation
- Security audit before launch

### 2. Low Latency Performance
- <2s for difficulty adjustments (candidate doesn't notice)
- <5s for question generation (acceptable wait)
- Event processing <100ms (maintains real-time feel)

### 3. Psychometric Validity
- IRT implementation must be mathematically correct
- Partner with psychometrician for validation
- A/B test different adaptation strategies
- Measure convergence accuracy

### 4. Comprehensive Audit Trail
- Every Interview Agent decision logged
- Immutable append-only logs
- Tamper detection (hashing)
- Post-session review capability

### 5. Scalability
- Design for 100+ concurrent sessions from day one
- Horizontal scaling of event processors
- Database query optimization
- Load testing before production

---

## Implementation Roadmap

### Phase 1: Foundation (2 weeks)
- Set up multi-agent architecture
- Implement basic event stream
- Verify context isolation
- Simple question rotation (no IRT yet)

### Phase 2: Monitoring (2 weeks)
- OpenTelemetry integration
- Performance tracking
- Admin dashboard
- Anomaly detection

### Phase 3: Adaptive Testing (2 weeks)
- IRT scoring engine
- Question seed database
- LLM-based generation
- Difficulty adjustment

### Phase 4: Advanced Features (2 weeks)
- Hint generation
- Struggle detection
- Multi-dimensional difficulty
- Optimization

### Phase 5: Production (2 weeks)
- Security audit
- Audit logging
- Load testing (100+ sessions)
- Documentation

**Total**: 10 weeks to production-ready system

---

## Competitive Landscape

Research revealed several AI-powered assessment platforms:

| Platform | Approach | Relevant Features |
|----------|----------|-------------------|
| **Vervoe** | AI grading + immersive tasks | Real-world simulations, instant scoring |
| **Glider AI** | AI proctoring + assessment | Real-time monitoring, anti-cheating |
| **Codility** | Developer-specific assessments | Coding challenges, automated evaluation |
| **HireVue** | Video + coding assessment | Auto-scored coding, competency measurement |
| **iMocha** | Adaptive testing | AI proctoring, difficulty adjustment |

**InterviewLM Differentiator**:
- **AI-native** (tests AI coding tool proficiency, not just coding)
- **Adaptive question generation** (most competitors use static banks)
- **Background agent architecture** (sophisticated real-time adjustment)
- **Transparent AI usage** (tracks how candidates use AI, not just final code)

---

## Risk Assessment & Mitigation

### Risk 1: Context Leakage
**Impact**: High (undermines assessment integrity)
**Mitigation**:
- 5-layer isolation strategy
- Automated testing
- Security audit
- Regular penetration testing

### Risk 2: IRT Implementation Errors
**Impact**: High (invalid ability estimates)
**Mitigation**:
- Partner with psychometrician
- Validate against known datasets
- A/B test against static difficulty
- Monitor convergence accuracy

### Risk 3: Performance/Latency
**Impact**: Medium (poor candidate experience)
**Mitigation**:
- Async event processing
- Database query optimization
- Caching strategies
- Load testing

### Risk 4: Question Pool Exhaustion
**Impact**: Medium (predictable assessments)
**Mitigation**:
- 20+ seeds per topic
- Dynamic LLM generation
- Variant system
- Regular seed additions

### Risk 5: Candidate Gaming the System
**Impact**: Low (Interview Agent can detect)
**Mitigation**:
- Anomaly detection algorithms
- Multiple performance dimensions
- Hidden test cases
- Behavioral analysis

---

## Open Questions for Team Discussion

1. **IRT Starting Point**: Should all candidates start at θ = 0, or use prior data (if repeat taker)?

2. **Adaptation Speed**: How aggressively should difficulty adjust? Conservative (learning rate = 0.2) vs aggressive (0.4)?

3. **Hint Strategy**: When should Interview Agent provide hints? After X minutes? After Y failures? Never?

4. **Question Count**: Fixed number (e.g., 5 questions) or adaptive until θ converges?

5. **Topic Coverage**: Ensure breadth (cover all topics) or depth (multiple questions on same topic)?

6. **Candidate Visibility**: Should candidates see their progress/performance during assessment?

7. **Scoring Model**: Pure IRT θ, or weighted combination (θ + code quality + AI usage)?

8. **Post-Assessment**: Should Interview Agent generate personalized feedback report?

---

## Next Steps

1. **Review Documentation**: Team reviews three research documents
2. **Architecture Decision**: Approve/modify recommended architecture
3. **Proof of Concept**: Build minimal 2-agent system in 1 week
4. **Validate Isolation**: Extensive testing of context separation
5. **IRT Consultation**: Engage psychometrician for IRT validation
6. **Pilot Design**: Design pilot study (10-20 real interviews)
7. **Go/No-Go**: Decide on full implementation based on POC

---

## Resources & References

### Academic Papers
- Item Response Theory + AI (IEEE 2024)
- Agent Design Pattern Catalogue (ArXiv 2405.10467)
- AgentSight: AI Agent Observability (ArXiv 2508.02736)

### Industry Documentation
- Azure AI Agent Orchestration Patterns
- Claude Agent SDK - Subagents Guide
- OpenTelemetry for AI Agents (2025)

### Tools & Platforms
- Langfuse (AI observability)
- Claude Agent SDK (Anthropic)
- OpenTelemetry (monitoring)
- InfluxDB (time-series metrics)

### Competitive Analysis
- Vervoe, Glider AI, Codility, HireVue, iMocha

**All detailed references available in**: `./INTERVIEW_AGENT_ARCHITECTURE.md`

---

## Conclusion

The research conclusively demonstrates that building a background Interview Agent is **technically feasible** and **aligned with industry best practices**. The recommended architecture leverages:

✅ **Proven patterns** (orchestrator-worker, observer)
✅ **Established science** (Item Response Theory)
✅ **Modern tooling** (Claude Agent SDK, OpenTelemetry)
✅ **Industry examples** (Azure, AWS, Google Cloud multi-agent systems)
✅ **Security best practices** (multi-layer isolation, audit logging)

The 10-week implementation roadmap provides a clear path to production, with built-in validation checkpoints and risk mitigation strategies.

**Recommendation**: Proceed with Phase 1 (Foundation) proof of concept.

---

**Prepared by**: Claude Code (Research Agent)
**Date**: 2025-11-13
**Version**: 1.0
