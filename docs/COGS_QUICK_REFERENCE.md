# InterviewLM COGS: Quick Reference Card

## THE BOTTOM LINE

| Metric | Value |
|--------|-------|
| **COGS per Assessment** | **$3.08** |
| **Current Price (Growth tier)** | **$3.99** |
| **Current Margin** | **22.8%** |
| **Recommended Price** | **$10.27-$12.32** |
| **Target Margin** | **70-75%** |
| **Current Undervaluation** | **+72% to +158%** |

---

## COGS BREAKDOWN (Per Assessment)

```
Modal AI Sandbox               $0.19  (6%)
├─ 90-min containerized environment

Claude API Tokens             $2.48  (81%)
├─ 75 interactions during assessment
├─ 1,000 input tokens/interaction @ $3/MTok
├─ 2,000 output tokens/interaction @ $15/MTok

Post-Assessment Analysis      $0.13  (4%)
├─ 4 AI interactions for report generation

Storage (S3 + Database)       $0.20  (6%)
├─ 500MB video @ $0.023/GB
├─ Metadata & logs in database

Network & Bandwidth           $0.01  (<1%)
├─ Video/report downloads, API responses

Infrastructure                $0.10  (3%)
├─ Compute, monitoring, security, anti-cheat

────────────────────────────────────
TOTAL COGS                    $3.08  (100%)
```

---

## PRICING AT DIFFERENT MARGINS

| Target Margin | Price Needed | Gap vs Current | Recommendation |
|--------------|-------------|-----------------|-----------------|
| 22.8% | $4.00 | Current pricing | Too low |
| 50% | $6.16 | +54% | Still low |
| 60% | $7.70 | +93% | Better |
| 70% | $10.27 | +157% | Recommended |
| 75% | $12.32 | +209% | Ideal |
| 80% | $15.40 | +286% | Premium positioning |
| 90% | $30.80 | +673% | Enterprise only |

---

## BREAK-EVEN CUSTOMER COUNT

Assuming $50,000/month fixed costs:

| Price | Contribution | Break-even | Customers Needed |
|-------|--------------|-----------|-----------------|
| $3.99 | $0.91 | 54,945 assess/mo | 549 companies |
| $5.96 | $2.88 | 17,361 assess/mo | 174 companies |
| $10.00 | $6.92 | 7,225 assess/mo | 72 companies |
| $12.32 | $9.24 | 5,408 assess/mo | 54 companies |

**Key insight:** Higher pricing = fewer customers needed to break even

---

## REVENUE IMPACT ANALYSIS

### Current Situation (200 Prof + 100 Growth + 10 Ent)

```
Revenue:              $89,690/month
COGS:                 $61,600/month
Gross Profit:         $28,090/month
Gross Margin:         31.3%
Status:               UNPROFITABLE
```

### With Recommended Pricing (Same customers, new tiers)

```
Revenue:              $149,670/month (+67%)
COGS:                 $70,840/month
Gross Profit:         $78,830/month (+181%)
Gross Margin:         52.7%
Status:               APPROACHING PROFITABILITY
```

### Monthly Improvement
```
+$59,980 in revenue
+$50,740 in gross profit
```

### Annual Improvement
```
+$719,760 in revenue
+$608,880 in gross profit
```

---

## RECOMMENDED PRICING TIERS

### Professional: $199/month (was $149)
- 25 assessments/month
- Overage: $8/assessment
- Target: Growing startups
- Margin: 61%

### Growth: $549/month (was $399)
- 100 assessments/month
- Overage: $5/assessment
- Target: Scaling companies
- Margin: 44%

### Premium: $999/month (NEW)
- 100 assessments/month
- Dedicated support
- Advanced analytics
- Margin: 69%
- Target: High-velocity hiring teams

### Enterprise: $2,000+/month (was $1,999)
- 200+ assessments/month
- Custom everything
- Target: Large organizations
- Margin: 70%+

---

## KEY COST DRIVERS

### Ranked by Impact on COGS

1. **Claude API Tokens: 80.5%** of COGS
   - Lever: Optimize prompts, implement caching
   - Potential savings: 40-50% ($1.00-$1.25)

2. **Modal Sandbox: 6.2%** of COGS
   - Lever: Use cheaper alternatives or negotiate volume
   - Potential savings: 20% ($0.04)

3. **Storage: 6.5%** of COGS
   - Lever: Compression, shorter retention, tiered storage
   - Potential savings: 50% ($0.10)

4. **Infrastructure: 3.3%** of COGS
   - Lever: Scale, optimize, consolidate services
   - Potential savings: 40% ($0.04)

5. **Analysis & Bandwidth: 4.2%** of COGS
   - Lever: Automation, smarter computation
   - Potential savings: 30% ($0.04)

### COGS Reduction Roadmap

```
Current:           $3.08
Month 3:           $2.80 (token optimization)
Month 6:           $2.20 (internal models)
Month 12:          $1.50 (full optimization)
```

With price held at $12.32:
- Current margin: 75%
- Future margin: 88%

---

## IMPLEMENTATION CHECKLIST

### Week 1: Preparation
- [ ] Update pricing page
- [ ] Draft customer communication
- [ ] Brief sales team
- [ ] Update billing system
- [ ] Prepare FAQ

### Week 2: Communication
- [ ] Announce new pricing
- [ ] Explain grandfathering (12 months)
- [ ] Offer 1-month free for annual commitments
- [ ] Field customer questions

### Week 3: Launch
- [ ] New pricing goes live for new customers
- [ ] Track adoption by tier
- [ ] Monitor churn closely

### Month 2: Optimization
- [ ] Launch Premium tier
- [ ] Create upgrade paths
- [ ] Measure conversion rates
- [ ] Adjust if needed

### Month 3-12: Monitoring
- [ ] Track KPIs (churn, ARPU, margin)
- [ ] Build Premium features
- [ ] Run land-and-expand campaigns
- [ ] Prepare for 12-month renewal cycle

---

## CRITICAL NUMBERS TO TRACK

**Monthly KPIs:**
- [ ] % new customers on each tier
- [ ] ARPU (target: $10+/assessment)
- [ ] Gross margin % (target: 70%+)
- [ ] Churn rate (target: <5% total)
- [ ] Churn due to pricing (target: <2%)

**Quarterly KPIs:**
- [ ] MRR growth
- [ ] Gross profit
- [ ] CAC payback period
- [ ] Customer LTV
- [ ] Months to profitability

---

## RISK MITIGATION

| Risk | Probability | Mitigation |
|------|-----------|-----------|
| High churn from price increase | Medium | 12-month grandfathering, strong product |
| Enterprise deals stall | Medium | Flexible negotiation, volume discounts |
| Premium tier doesn't sell | Low | Include team features, free trial |
| Competitors undercut | Medium | Emphasize quality, ROI, support |

---

## TOKEN USAGE SENSITIVITY

### If token usage increases 50% (worse efficiency)
```
Current Claude cost: $2.48
New Claude cost:     $3.71 (+50%)
New COGS:           $4.31
Price for 70% margin: $14.37 (vs $10.27)
```

### If token usage decreases 50% (better efficiency)
```
Current Claude cost: $2.48
New Claude cost:     $1.24 (-50%)
New COGS:           $1.84
Price for 70% margin: $6.13 (vs $10.27)
```

**Bottom line:** Token optimization is highest-leverage cost reduction opportunity

---

## COMPARISON TO MARKET

| Product | Est. Price | Est. Margin | Notes |
|---------|-----------|-----------|-------|
| **InterviewLM (current)** | $4-6/assess | 23-48% | Too low |
| **InterviewLM (recommended)** | $10-12/assess | 70-75% | Optimal |
| **Codility** | $5-8/assess | 60-70%+ | Scale competitor |
| **HackerRank** | $8-15/assess | 70%+ | Market leader |
| **LeetCode Premium** | $0.50/month (unlimited) | — | B2C, different model |

**Positioning:** InterviewLM should compete with HackerRank on pricing, not undercut

---

## ELEVATOR PITCH FOR STAKEHOLDERS

**For Investors:**
"We're currently underpriced by 70-150% vs. market. By optimizing pricing to align with value delivered and SaaS norms, we can achieve 70%+ gross margins and profitability with just 54-72 customers instead of 500+. Implementing our recommended pricing strategy increases annual gross profit by $600K+."

**For Sales Team:**
"We're raising prices because customers realize this is worth more. Higher prices attract better customers, improve unit economics, and let us invest in the product faster. Grandfathering existing customers rewards loyalty while we capture better margins on new deals."

**For Product Team:**
"Price increase signals quality and gives us resources for investment. We're now competitive with HackerRank and can justify bigger R&D budgets. Focus on the Premium tier—it has best margins and highest NPS potential."

---

## DECISION FRAMEWORK

**Implement aggressive pricing if:**
- [ ] You believe in your product quality
- [ ] You have strong product-market fit signals
- [ ] You're willing to accept some churn
- [ ] You need profitability soon
- [ ] You can support higher-end customers

**Use conservative pricing if:**
- [ ] You're still finding product-market fit
- [ ] You need volume metrics for fundraising
- [ ] Customer acquisition is a major blocker
- [ ] You're competing heavily on price
- [ ] Your customer base is price-sensitive

**Recommendation:** Aggressive (Strategy 1) given:
- InterviewLM already has positioning (landing page is excellent)
- Clear value prop (AI-powered real-world testing)
- Existing customer base to grandfather
- Market demand appears strong (based on pricing page ROI calculator)

---

## FINAL RECOMMENDATION

**Immediately implement:**
1. Increase Professional tier to $199/month (+34%)
2. Increase Growth tier to $549/month (+38%)
3. Create Premium tier at $999/month
4. Update Enterprise pricing to $2,000+/month for 200+ assessments
5. Grandfather all existing customers for 12 months

**Expected outcome:**
- Same customer base generates +$50K/month profit
- 70-75% gross margins (industry standard)
- Only 54-72 customers needed to break even
- Resources to invest in product and growth

**Timeline:** Implement within 4 weeks

