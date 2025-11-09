# InterviewLM: Complete Cost of Goods Sold (COGS) Analysis

**Assessment Duration:** 90 minutes
**Target Price Point:** $10 per assessment

---

## 1. DETAILED COGS BREAKDOWN PER ASSESSMENT

### Component 1: Modal AI Sandbox Infrastructure
- **Cost:** $0.19 per 90-minute session
- **Why:** Containerized execution environment for code sandboxing
- **Status:** Confirmed
- **Per Assessment:** **$0.19**

---

### Component 2: Claude API Token Costs

#### 2.1 Interaction Volume Estimation

During a 90-minute assessment:
- **Pre-assessment setup:** 2-3 interactions (problem loading, system context)
- **During assessment:**
  - 50-100 code submissions (user generated)
  - Real-time feedback on each submission
  - Anti-cheating checks
  - Performance monitoring
- **Post-assessment:** 5-10 interactions (analysis, grading)

**Conservative estimate: 75 interactions over 90 minutes**

#### 2.2 Token Usage per Interaction

**Input tokens (per interaction):**
- Problem context/code submission: ~500-700 tokens
- User's code artifact: ~300-500 tokens
- System prompt + conversation history: ~100-200 tokens
- **Average: 1,000 input tokens per interaction**

**Output tokens (per interaction):**
- Feedback/evaluation: ~1,000 tokens
- Code analysis results: ~500 tokens
- Coaching suggestions: ~500 tokens
- **Average: 2,000 output tokens per interaction**

#### 2.3 Claude API Cost Calculation

**Per interaction:**
- Input cost: 1,000 tokens × ($3 / 1,000,000) = $0.003
- Output cost: 2,000 tokens × ($15 / 1,000,000) = $0.030
- **Subtotal per interaction: $0.033**

**Per assessment (75 interactions):**
- Total input: 75 × 1,000 = 75,000 tokens = $0.225
- Total output: 75 × 2,000 = 150,000 tokens = $2.25
- **Total Claude cost per assessment: $2.475**

**Breakdown:**
- Input tokens: $0.225 (9%)
- Output tokens: $2.25 (91%)
- **Per Assessment: $2.48** ✓

---

### Component 3: Post-Assessment Analysis

#### 3.1 Analysis Operations
- Summary generation: ~1 interaction
- Skill matching analysis: ~1 interaction
- Performance comparison: ~1 interaction
- Report generation with Claude: ~1 interaction

**Estimated interactions: 4 calls**

#### 3.2 Claude Cost for Analysis
- Input: 4 × 1,000 tokens = 4,000 tokens = $0.012
- Output: 4 × 2,000 tokens = 8,000 tokens = $0.12
- **Total: $0.132**

**Range provided:** $0.05-0.12
**Calculated cost: $0.132** (slightly above estimate, using calculated value)
**Per Assessment: $0.13** ✓

---

### Component 4: Storage Costs

#### 4.1 Session Data Storage (S3)
**Data stored per assessment:**
- Video recording: 500 MB (90 min @ ~92kbps) = 677 MB
- Code artifacts: 10-15 files, ~5 MB total
- Session logs: ~2 MB
- Screenshots/telemetry: ~3 MB
- **Total per assessment: ~690 MB (0.69 GB)**

**S3 Standard pricing (US-East):**
- Storage: $0.023 per GB per month
- Cost if stored 1 month: 0.69 × $0.023 = $0.016

**Lifetime assumptions:**
- Most assessments referenced for 3-6 months (compliance/audit)
- Average retention: 6 months
- Amortized monthly cost: $0.016
- Amortized per assessment (6 month retention): $0.016 × 6 = $0.096

**Per Assessment (6-month retention): $0.10** ✓

#### 4.2 Database Storage (DynamoDB/PostgreSQL)
**Data per assessment:**
- Assessment metadata: ~50 KB
- Interaction logs: ~500 KB
- Results/scoring: ~100 KB
- **Total: ~650 KB per assessment**

**Database cost assumptions:**
- Hosted database (e.g., AWS RDS): ~$200/month for 1TB capacity
- Estimated assessments per month at scale: 2,000
- Cost per assessment: $200 / 2,000 = $0.10

**Per Assessment: $0.10** ✓

---

### Component 5: Network & Bandwidth Costs

#### 5.1 Data Transfer
**Egress traffic per assessment:**
- Video download: ~70 MB × $0.0875/GB = $0.0061
- Report download: ~5 MB × $0.0875/GB = $0.0004
- API responses: ~20 MB × $0.0875/GB = $0.0018
- **Total egress: ~$0.008**

**Ingress (free tier):**
- User code uploads, video ingestion = Free

**Per Assessment: $0.01** ✓

---

### Component 6: Other Infrastructure Costs

#### 6.1 Computing Infrastructure
**Shared infrastructure costs:**
- Load balancing
- Monitoring/logging (CloudWatch, Datadog)
- API gateway
- Compute for processing
- **Estimated per assessment:** $0.05

#### 6.2 Third-Party Services
- Anti-plagiarism/cheating detection: $0.02
- Security scanning: $0.01
- **Subtotal: $0.03**

#### 6.3 Payment Processing
- Stripe/payment gateway (2.9% + $0.30 per transaction)
- Amortized over larger transactions
- **Per $10 assessment: $0.29 + 2.9% = $0.59** (but this is typically not included in COGS, rather SG&A)
- **For COGS purposes (infrastructure only): $0.02**

**Per Assessment (infrastructure only): $0.07** ✓

---

### Component 7: LLM Fine-Tuning & Model Access
- Maintained through Claude API costs
- No additional direct costs if using Claude standard models
- **Per Assessment: Included in Component 2** ($0.00 additional)

---

## COMPLETE COGS SUMMARY TABLE

| Component | Cost per Assessment | Notes |
|-----------|-------------------|-------|
| 1. Modal AI Sandbox | $0.19 | 90-minute containerized environment |
| 2. Claude API Tokens | $2.48 | 75 interactions @ 1K input, 2K output |
| 3. Post-Assessment Analysis | $0.13 | AI-powered summary & report generation |
| 4. Storage (S3) | $0.10 | 0.69 GB @ 6-month average retention |
| 5. Database Storage | $0.10 | Metadata, logs, results amortized |
| 6. Network/Bandwidth | $0.01 | Data egress and transfer costs |
| 7. Infrastructure (compute, monitoring, security) | $0.07 | Load balancing, logging, security tools |
| **TOTAL COGS** | **$3.08** | **Per assessment** |

---

## 2. PRICING & MARGIN ANALYSIS

### Current Market Analysis
From InterviewLM pricing page:
- **Professional Plan:** $149/month for 25 assessments = $5.96/assessment
- **Growth Plan:** $399/month for 100 assessments = $3.99/assessment
- **Overage rates:** $5-8 per assessment

### Scenario 1: $10 Per-Assessment Price Point

**Revenue:** $10.00
**COGS:** $3.08
**Gross Profit:** $6.92
**Gross Margin:** 69.2%

**Analysis:**
- Highly profitable pricing
- Well above typical SaaS gross margin (70-85%)
- Suggests current market pricing ($3.99-$5.96) may be artificially low

---

## 3. BREAK-EVEN ANALYSIS

### Assessment Volume Required to Break Even

Assuming:
- Monthly fixed costs (salaries, rent, etc.): $50,000
- Variable costs per assessment: $3.08
- Revenue per assessment: Price point

#### At Different Price Points:

**At $3.99/assessment (Growth Plan):**
- Contribution margin: $3.99 - $3.08 = $0.91
- Break-even volume: $50,000 / $0.91 = **54,945 assessments/month**
- At $399/month × 100 assessments = **Approximately 549 paid accounts needed**

**At $5.96/assessment (Professional Plan):**
- Contribution margin: $5.96 - $3.08 = $2.88
- Break-even volume: $50,000 / $2.88 = **17,361 assessments/month**
- **Approximately 173 mid-tier accounts needed**

**At $10.00/assessment (Target):**
- Contribution margin: $10.00 - $3.08 = $6.92
- Break-even volume: $50,000 / $6.92 = **7,225 assessments/month**
- **Approximately 72 accounts needed**

---

## 4. MARGIN ANALYSIS AT DIFFERENT PRICE POINTS

### Gross Margin Goals

**To achieve 70% Gross Margin:**
- Formula: (Price - COGS) / Price = 0.70
- Calculation: (Price - $3.08) / Price = 0.70
- Price - $3.08 = 0.70 × Price
- $3.08 = 0.30 × Price
- **Minimum Price: $10.27**

**To achieve 80% Gross Margin:**
- Formula: (Price - COGS) / Price = 0.80
- Calculation: (Price - $3.08) / Price = 0.80
- Price - $3.08 = 0.80 × Price
- $3.08 = 0.20 × Price
- **Minimum Price: $15.40**

**To achieve 90% Gross Margin:**
- Formula: (Price - COGS) / Price = 0.90
- Calculation: (Price - $3.08) / Price = 0.90
- Price - $3.08 = 0.90 × Price
- $3.08 = 0.10 × Price
- **Minimum Price: $30.80**

---

## 5. RECOMMENDED PRICING STRATEGY

### Current Pricing vs Optimal Pricing

| Target Margin | Required Price | Current Price | Gap | Recommendation |
|--------------|----------------|---------------|-----|-----------------|
| 70% Margin | $10.27 | $5.96 | +72% | Too low |
| 80% Margin | $15.40 | $5.96 | +158% | Significantly underpriced |
| 90% Margin | $30.80 | $5.96 | +417% | Massively underpriced |

### Optimal Tiered Pricing (Target 75% margin)

**Formula for 75% margin:** (Price - $3.08) / Price = 0.75
- **Optimal per-assessment price: $12.32**

#### Revised Tier Recommendations:

**1. Free Trial (14 days, up to 10 assessments)**
- Risk: High CAC burn
- Benefit: Conversion funnel
- Keep as-is for lead generation

**2. Professional Tier**
- **Current:** $149/month for 25 assessments ($5.96/each)
- **Recommended:** $199/month for 25 assessments ($7.96/each)
  - Gross margin: 61%
  - Justification: Entry-level, need lower margin for adoption

**3. Growth Tier**
- **Current:** $399/month for 100 assessments ($3.99/each)
- **Recommended:** $590/month for 75 assessments ($7.87/each)
  - Gross margin: 64%
  - Alternative: $549/month for 100 assessments ($5.49/each) = 44% margin (volume discount)

**4. Premium/Performance Tier (NEW)**
- **Suggested:** $999/month for 100 assessments ($9.99/each)
  - Gross margin: 69%
  - Target: High-frequency hiring teams
  - Includes: Advanced analytics, custom workflows

**5. Enterprise Tier**
- **Current:** $1,999/month for 500+ assessments (~$4/each)
- **Recommended:** $1,999/month for 200 assessments ($10/each)
  - Gross margin: 69%
  - Volume pricing: Negotiate custom per case
  - Minimum deal size: $2,000/month

---

## 6. FINANCIAL IMPACT PROJECTIONS

### Scenario A: Conservative Pricing (Current Market)

**Assumptions:**
- 200 companies at Professional tier
- 100 companies at Growth tier
- 10 companies at Enterprise tier

**Monthly Revenue:**
- Professional: 200 × $149 = $29,800
- Growth: 100 × $399 = $39,900
- Enterprise: 10 × $1,999 = $19,990
- **Total: $89,690**

**Total Assessments:** (200 × 25) + (100 × 100) + (10 × 500) = 11,500

**COGS:** 11,500 × $3.08 = $35,420

**Gross Profit:** $89,690 - $35,420 = $54,270

**Gross Margin:** 60.4%

---

### Scenario B: Optimized Pricing (Recommended)

**Assumptions:**
- Same customer base with new pricing
- 200 companies at Professional tier ($199/mo)
- 100 companies at Growth tier ($549/mo for 100 assessments)
- 10 companies at Enterprise tier (custom, avg $2,500/mo)
- 30 companies at new Premium tier ($999/mo)

**Monthly Revenue:**
- Professional: 200 × $199 = $39,800
- Growth: 100 × $549 = $54,900
- Premium: 30 × $999 = $29,970
- Enterprise: 10 × $2,500 = $25,000
- **Total: $149,670**

**Total Assessments:** (200 × 25) + (100 × 100) + (30 × 100) + (10 × 500) = 13,500

**COGS:** 13,500 × $3.08 = $41,580

**Gross Profit:** $149,670 - $41,580 = $108,090

**Gross Margin:** 72.2%

**Improvement:** +$53,820 monthly (+99% gross profit increase)

---

### Scenario C: Premium Positioning (80% Margin Target)

**Positioning:** AI-powered assessment leader, premium brand

**Pricing:**
- Professional: $249/month for 25 assessments
- Growth: $749/month for 100 assessments
- Premium: $1,299/month for 150 assessments
- Enterprise: $3,000+/month (custom)

**Conservative volume assumptions** (35% fewer customers due to higher price):
- 130 Professional
- 65 Growth
- 15 Premium
- 8 Enterprise

**Monthly Revenue:**
- Professional: 130 × $249 = $32,370
- Growth: 65 × $749 = $48,685
- Premium: 15 × $1,299 = $19,485
- Enterprise: 8 × $3,000 = $24,000
- **Total: $124,540**

**Total Assessments:** (130 × 25) + (65 × 100) + (15 × 150) + (8 × 300) = 10,200

**COGS:** 10,200 × $3.08 = $31,416

**Gross Profit:** $124,540 - $31,416 = $93,124

**Gross Margin:** 74.8%

**Analysis:**
- Slightly lower absolute profit than Scenario B
- Much higher per-customer LTV
- Better margins to support growth/sales investment
- More sustainable long-term

---

## 7. SENSITIVITY ANALYSIS

### How COGS Changes Affect Pricing

**Scenario: Claude token usage doubles (poor efficiency)**
- New COGS: $3.08 + $2.48 = $5.56
- Price needed for 70% margin: $18.53 (vs $10.27)

**Scenario: Claude token usage halves (improved efficiency)**
- New COGS: $3.08 - $1.24 = $1.84
- Price needed for 70% margin: $6.13 (vs $10.27)

**Key Insight:** Token optimization is the highest-impact cost reduction opportunity

---

## 8. RECOMMENDATIONS SUMMARY

### Immediate Actions (0-3 months):
1. **Increase pricing by 25-35%** across all tiers
2. **Introduce annual billing discount** (17% as shown in pricing page)
3. **Create Premium tier** for high-frequency users
4. **Grandfather existing customers** at current pricing for 12 months

### Medium-term (3-12 months):
1. **Optimize Claude token usage** through prompt engineering and caching
2. **Reduce COGS from $3.08 to $2.50** through efficiency gains
3. **Add per-assessment overage pricing** ($8-12/overage)
4. **Implement usage-based pricing** option for enterprise

### Long-term (12+ months):
1. **Fine-tune custom models** to reduce reliance on Claude API
2. **Implement internal assessment evaluation system** (reduce Claude costs by 40%)
3. **Target 80%+ gross margins** through product optimization
4. **Expand into adjacent markets** (certifications, bootcamps, etc.)

---

## 9. APPENDIX: DETAILED COST ASSUMPTIONS

### Claude Model Details
- Model: Claude 3.5 Sonnet
- Input rate: $3 per Million tokens
- Output rate: $15 per Million tokens
- Assumed interaction: 1K input, 2K output = $0.033

### Infrastructure Assumptions
- Modal sandbox: $0.19 per session (confirmed from spec)
- S3 storage: $0.023/GB/month (US-East standard)
- Database: 650KB per assessment, amortized
- Network egress: $0.0875/GB (standard rate)

### Volume Assumptions for Break-even
- Operating costs: $50,000/month (variable)
- Scaling from current assumptions
- Not including S&A, R&D, customer success, sales

### Assessment Characteristics
- Duration: 90 minutes
- Interactions: 75 (conservative estimate)
- Code storage: ~0.69GB
- Retention period: 6 months average

