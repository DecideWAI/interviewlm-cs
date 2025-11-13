# InterviewLM Pricing Implementation Guide

## Part 1: Pricing Tier Configuration

### Complete Pricing Structure JSON

```json
{
  "pricingTiers": {
    "prepaid": [
      {
        "id": "paygo",
        "name": "Pay As You Go",
        "description": "Perfect for testing and low-volume hiring",
        "creditAmount": 1,
        "unitPrice": 10.00,
        "totalPrice": 10.00,
        "discountPercent": 0,
        "features": [
          "No credit card during trial",
          "Use within 30 days",
          "No expiration after that",
          "Access all assessment types"
        ],
        "recommendedFor": "Trying the platform",
        "monthlyEquivalent": "variable",
        "costPerAssessment": 10.00,
        "margin": 0.85
      },
      {
        "id": "small_pack",
        "name": "Small Pack",
        "description": "For small teams with regular hiring",
        "creditAmount": 10,
        "unitPrice": 9.00,
        "totalPrice": 90.00,
        "discountPercent": 10,
        "features": [
          "10 assessments to use",
          "No expiration",
          "All assessment types",
          "Email support",
          "API access for integrations"
        ],
        "recommendedFor": "Startups hiring 1-2 roles/month",
        "monthlyEquivalent": 90,
        "costPerAssessment": 9.00,
        "margin": 0.83
      },
      {
        "id": "medium_pack",
        "name": "Medium Pack",
        "description": "For growing companies with steady hiring",
        "creditAmount": 50,
        "unitPrice": 7.50,
        "totalPrice": 375.00,
        "discountPercent": 25,
        "features": [
          "50 assessments included",
          "No expiration",
          "All assessment types",
          "Priority email support",
          "API access",
          "Advanced analytics dashboard",
          "Custom assessment library"
        ],
        "recommendedFor": "Companies hiring 40-60/month",
        "monthlyEquivalent": 375,
        "costPerAssessment": 7.50,
        "margin": 0.80
      },
      {
        "id": "large_pack",
        "name": "Large Pack",
        "description": "For scale-ups with high hiring volume",
        "creditAmount": 200,
        "unitPrice": 6.00,
        "totalPrice": 1200.00,
        "discountPercent": 40,
        "features": [
          "200 assessments included",
          "No expiration",
          "All assessment types",
          "24/7 email support",
          "API access with higher limits",
          "Advanced analytics",
          "Custom assessment library",
          "Bulk invite tools",
          "Team collaboration features",
          "Custom branding"
        ],
        "recommendedFor": "Companies hiring 150-250/month",
        "monthlyEquivalent": 1200,
        "costPerAssessment": 6.00,
        "margin": 0.75
      },
      {
        "id": "enterprise_pack",
        "name": "Enterprise Pack",
        "description": "For large enterprises with custom needs",
        "creditAmount": 500,
        "unitPrice": 5.00,
        "totalPrice": 2500.00,
        "discountPercent": 50,
        "features": [
          "500+ assessments",
          "Custom volume pricing available",
          "Dedicated account manager",
          "24/7 phone + email support",
          "All features included",
          "Custom SLA agreements",
          "White-glove onboarding",
          "Advanced security (SSO/SAML)",
          "Custom integrations",
          "Priority feature requests"
        ],
        "recommendedFor": "Enterprise with 500+ annual assessments",
        "monthlyEquivalent": "custom",
        "costPerAssessment": 5.00,
        "margin": 0.70
      }
    ],
    "subscription": [
      {
        "id": "starter_sub",
        "name": "Starter",
        "description": "Essential hiring tools for small teams",
        "monthlyPrice": 79,
        "annualPrice": 789,
        "annualDiscount": 0.17,
        "includedAssessments": 10,
        "overage": 8.00,
        "features": [
          "10 assessments/month",
          "Up to 10 users",
          "All assessment types",
          "Basic analytics",
          "Email support",
          "API access"
        ],
        "recommendedFor": "Early-stage startups",
        "costPerIncluded": 7.90,
        "margin": 0.82
      },
      {
        "id": "professional_sub",
        "name": "Professional",
        "description": "Everything you need to scale hiring",
        "monthlyPrice": 199,
        "annualPrice": 1988,
        "annualDiscount": 0.17,
        "includedAssessments": 30,
        "overage": 7.00,
        "features": [
          "30 assessments/month",
          "Up to 25 users",
          "All assessment types",
          "Advanced analytics",
          "Priority support",
          "API access",
          "Custom branding",
          "Slack/Teams integration"
        ],
        "recommendedFor": "Growing startups",
        "costPerIncluded": 6.63,
        "margin": 0.80
      },
      {
        "id": "growth_sub",
        "name": "Growth",
        "description": "Advanced features for high-volume hiring",
        "monthlyPrice": 499,
        "annualPrice": 4989,
        "annualDiscount": 0.17,
        "includedAssessments": 100,
        "overage": 5.00,
        "features": [
          "100 assessments/month",
          "Unlimited users",
          "All assessment types",
          "Advanced analytics",
          "Dedicated support",
          "API access",
          "Custom branding",
          "All integrations",
          "Custom assessment library",
          "Bulk candidate tools"
        ],
        "recommendedFor": "Scale-ups and mid-market",
        "costPerIncluded": 4.99,
        "margin": 0.78,
        "badge": "Most Popular"
      },
      {
        "id": "scale_sub",
        "name": "Scale",
        "description": "Enterprise-grade hiring platform",
        "monthlyPrice": 1299,
        "annualPrice": 12989,
        "annualDiscount": 0.17,
        "includedAssessments": 300,
        "overage": 4.00,
        "features": [
          "300 assessments/month",
          "Unlimited everything",
          "All assessment types",
          "Dedicated account manager",
          "24/7 support",
          "All features included",
          "Custom SLA",
          "Advanced security",
          "White-glove onboarding",
          "Priority feature development"
        ],
        "recommendedFor": "Large enterprises",
        "costPerIncluded": 4.33,
        "margin": 0.76
      }
    ]
  },
  "costStructure": {
    "baseInfrastructure": {
      "aiInference": 1.00,
      "serverStorage": 0.50,
      "paymentProcessing": 0.25,
      "supportOverhead": 0.25,
      "total": 2.00
    },
    "cogs": 1.50,
    "cogsRange": {
      "low": 1.00,
      "high": 2.00
    }
  }
}
```

---

## Part 2: Discount Calculation Examples

### Scenario 1: Company with 100 Assessments/Month

#### Option A: Prepaid Packs
```
Medium Pack (50 credits): $375
- 2 packs for 100 assessments = $750/month
- Cost per assessment: $7.50
- Annual: $9,000

Comparison to PAYG:
- PAYG at $10: $12,000/year
- Savings: $3,000/year (25% discount)
- Decision: Medium pack is clearly better
```

#### Option B: Monthly Subscription
```
Growth Plan: $499/month (100 assessments included)
- Monthly: $499
- Annual: $5,988 (with 17% discount)
- Cost per assessment: $4.99

Overage scenario (120 assessments):
- Included: 100 = $499
- Overage: 20 × $5.00 = $100
- Total: $599 (~$4.99/assessment)
```

#### Value Proposition
```
Prepaid Medium: $9,000/year
Subscription Growth: $5,988/year (with annual prepay)
Savings with Subscription: $3,012/year (33% less)
BUT: Prepaid gives cash flow + sunk cost retention
```

---

### Scenario 2: Enterprise with 1,000 Assessments/Month

#### Option A: Large Pack Recurring Purchase
```
Large Pack: $1,200 for 200 credits
- 5 packs for 1,000 assessments = $6,000/month
- Cost per assessment: $6.00
- Annual: $72,000
```

#### Option B: Enterprise Custom Pricing
```
Negotiated Rate: $4.50/assessment (10% below listed $5.00)
- 1,000 × $4.50 = $4,500/month
- Annual: $54,000
- Savings vs Large Pack: $18,000/year (25%)
- With multi-year discount (5% more): $51,300/year
```

#### Value Proposition
```
Large Pack Repeat: $72,000/year
Enterprise Custom (1yr): $54,000/year (25% savings)
Enterprise Custom (3yr): $153,900 total ($4.28/assessment)
With CSM, SLA, priority support included
LTV Potential: $150,000+ over 3 years
```

---

### Scenario 3: Startup Starting at PAYG

#### Progression Path
```
Month 0-1: Free trial (10 free assessments)
- Trial assessment cost: $0
- Conversion rate target: 80% → 0.8 probability

Month 1-3: PAYG usage
- Average usage: 8 assessments/month
- Cost: 8 × $10 = $80/month
- Revenue per customer: $240

Month 3-6: Upsell to Small Pack
- Conversion rate target: 30%
- Small Pack cost: $90
- Effective cost per assessment: $9
- Revenue per customer: $270

Month 6-12: Upsell to Medium Pack
- Usage increased to 45 assessments/month
- Conversion rate target: 40%
- Medium Pack cost: $375/month
- Revenue per customer: $4,500/year

Year 2+: Potentially Large Pack
- Conversion rate target: 25% (if company grows)
- Large Pack cost: $1,200/month
- Annual Revenue: $14,400
- 3-year LTV: $25,275 (Medium $4,500 + Large $14,400 + growth)

TOTAL CUSTOMER PROGRESSION VALUE:
- Year 1: $6,195 (trial + paygo + first pack upgrades)
- Year 2: $14,400 (large pack or continued medium)
- Year 3: $14,400+ (sustained or larger pack)
- 3-Year LTV: $35,000+
```

---

## Part 3: Revenue Projections by Cohort

### Cohort Model (Monthly Cohorts)

```
Cohort Analysis: Customer acquisition and progression by entry tier

SMALL PACK COHORT (50 customers/month in cohort)
Month 0:
- Revenue: 50 × $90 = $4,500
- Active: 50
- Churn: 10% = 5
- Remaining: 45

Month 1:
- Revenue: 45 × $90 = $4,050
- Upgrade to Medium: 10% × 45 = 4.5
- New: 45 (repeat purchasers)
- Revenue from upgraded: 4.5 × $375 = $1,687.50
- Total: $5,737.50

Month 2:
- Revenue: 40.5 × $90 + 8 × $375 = $6,660
- Net churn slowing
- Total active: 48.5

Month 3+:
- Stabilizes at ~$7,000-8,000/month from cohort
- Some upgrade to Medium each month
- Some annual repurchase on PAYG

ANNUAL REVENUE FROM SMALL PACK COHORT:
Average month: $6,500
Annual contribution: $78,000

MULTIPLY by 12 cohorts throughout year:
Year 1 Small Pack revenue: ~$468,000 (weighted for acquisition ramp)


MEDIUM PACK COHORT (40 customers/month)
Monthly revenue: 40 × $375 = $15,000
Plus upgrades from Small Pack: ~5 × $375 = $1,875
Total new cohort revenue: $16,875

Month 1 retention: 85% (better than small pack)
- Continue: 34 × $375 = $12,750
- Upgrade to Large: 2 × $1,200 = $2,400
- New Small upgrades: 3 × $375 = $1,125
- Total: $16,275

Stabilizes at: ~$15,000-16,000/month after M3

ANNUAL REVENUE FROM MEDIUM PACK COHORT:
Average month: $15,500
Annual contribution: $186,000

MULTIPLY by 12 cohorts:
Year 1 Medium Pack revenue: ~$1,116,000 (weighted for ramp)


LARGE PACK COHORT (8 customers/month)
Monthly revenue: 8 × $1,200 = $9,600
Month 1-3 retention: ~90%

Upgrades from Medium: 2-3 per month
New revenue from upgrades: $2,400-3,600/month

Stabilizes at: ~$11,000-12,000/month by Month 6

ANNUAL REVENUE FROM LARGE PACK COHORT:
Average month: $11,000
Annual contribution: $132,000

MULTIPLY by 12 cohorts:
Year 1 Large Pack revenue: ~$396,000 (weighted for ramp)


ENTERPRISE COHORT (2 customers/month)
Average deal: $5,000-15,000/month
Conservative estimate: $8,000/month

Monthly revenue: 2 × $8,000 = $16,000

ANNUAL REVENUE FROM ENTERPRISE COHORT:
Average month: $16,000
Annual contribution: $192,000

MULTIPLY by 12 cohorts:
Year 1 Enterprise revenue: ~$576,000 (weighted for ramp)


PAYGO AND TRIAL COHORT (200 customers/month)
Month 0-3: Average $30/customer before churn
- Monthly revenue: 200 × $30 = $6,000
- Churn: 70%

Month 1: 60 remaining
- Revenue: 60 × $25 = $1,500
- Some convert to Small Pack: 3 × $90 = $270
- Upgrades: $1,770

Month 2-3: Continue decline, only active users remain

Average lifetime value per PAYGO customer: $75
Monthly cohort contribution: 200 × $75 = $15,000 (one-time)

ANNUAL CONTRIBUTION: ~$90,000 (gradual decline as customers upgrade)


TOTAL YEAR 1 REVENUE ESTIMATE:
Small Pack: $468,000
Medium Pack: $1,116,000
Large Pack: $396,000
Enterprise: $576,000
PAYGO/Trial: $90,000
TOTAL: $2,646,000

With seasonal variation and growth ramp:
Conservative estimate: $2,098,000 - $2,400,000
```

---

## Part 4: Customer Acquisition Cost (CAC) Analysis

### By Tier (Annual)

```
PAYGO/TRIAL COHORT
Acquisition cost: Mostly organic/viral
- Free trial signup: ~$0
- Email nurture: ~$2 per customer
- Total CAC: ~$2
- First-year revenue: $75
- Payback: Immediate
- Viability: Good for viral growth, gateway

SMALL PACK COHORT
Acquisition cost: Content + organic + early sales
- Content marketing: $500/100 customers = $5 per
- Sales outreach: $1,000/100 customers = $10 per
- Total CAC: ~$15
- First-year revenue: $1,080 (yearly average)
- Payback: ~1.7 months
- CAC:LTV Ratio: 1:72 (excellent)
- Viability: Highly profitable

MEDIUM PACK COHORT
Acquisition cost: Sales + partnerships
- Content: $5
- Sales (more complex): $25
- Partnerships/integrations: $10
- Total CAC: ~$40
- First-year revenue: $4,500 (yearly average)
- Payback: ~3.2 months
- CAC:LTV Ratio: 1:112 (excellent)
- Viability: Very profitable

LARGE PACK COHORT
Acquisition cost: Enterprise sales
- Sales team time: $150 (10-15 hour sales cycle)
- Marketing: $20
- Demo environment: $10
- Total CAC: ~$180
- First-year revenue: $14,400
- Payback: ~1.5 months
- CAC:LTV Ratio: 1:80 (excellent)
- Viability: Highly profitable with high-quality sales

ENTERPRISE COHORT
Acquisition cost: Dedicated sales
- Account executive time: $500-1,000 (50-100 hour sales cycle)
- Legal/contracts: $200
- Demo/customization: $300
- Total CAC: ~$1,000
- First-year revenue: $100,000
- Payback: ~1.2 months
- CAC:LTV Ratio: 1:100+ (excellent)
- CAC:LTV (3-year): 1:300+ (exceptional)
- Viability: Extremely profitable with proper sales team
```

---

## Part 5: Implementation Checklist

### Phase 1: Product Setup (Weeks 1-2)
- [ ] Database schema for credit-based billing
- [ ] Credit system: purchase, usage, expiry
- [ ] Billing integration with Stripe/Paddle
- [ ] Subscription management system
- [ ] Admin panel for overrides/refunds
- [ ] Usage tracking and analytics
- [ ] Overage detection and billing

### Phase 2: Frontend Updates (Weeks 2-3)
- [ ] Update pricing page with both models
- [ ] Tier comparison tool
- [ ] ROI calculator (interactive)
- [ ] Checkout flow for prepaid
- [ ] Subscription management UI
- [ ] Credit usage dashboard
- [ ] Upgrade/downgrade flows

### Phase 3: Operations (Weeks 3-4)
- [ ] Customer support playbooks
- [ ] Upgrade recommendation triggers
- [ ] Email automation sequences
- [ ] Sales collateral and pricing justification
- [ ] FAQ updates
- [ ] Knowledge base articles
- [ ] Customer onboarding by tier

### Phase 4: Analytics & Optimization (Weeks 4-6)
- [ ] Dashboard: Tier distribution
- [ ] Dashboard: CAC by tier
- [ ] Dashboard: Churn by tier
- [ ] Dashboard: Revenue by cohort
- [ ] A/B testing: Discount percentages
- [ ] Email performance: Upgrade triggers
- [ ] Conversion funnel analysis

### Phase 5: Sales Enablement (Weeks 6-8)
- [ ] Sales training on pricing
- [ ] Discount authority guidelines
- [ ] Enterprise discount frameworks
- [ ] Sales compensation alignment
- [ ] CRM integration with pricing
- [ ] Proposal generation automation

---

## Part 6: Monitoring & Optimization Metrics

### Weekly Metrics
```
New Signups by Tier:
- PAYGO: ___ (target: 60-70% of trials)
- Small Pack: ___ (target: 15-20%)
- Medium Pack: ___ (target: 10-15%)
- Large+ Pack: ___ (target: 5%)

Conversion Rate (Trial → Paid):
- Target: 25-30%
- Current: ___%
- Trend: ↑ ↓ →

Revenue Run Rate:
- This week MRR: $____
- Annualized: $____
- vs. forecast: ___
```

### Monthly Metrics
```
ARPU (Average Revenue Per User):
- By tier: PAYGO $__, Small $__, Medium $__, Large $__
- Overall: $____
- Target: $1,000-2,000

Churn Rate:
- By tier: PAYGO __%, Small __%, Medium __%, Large __%
- Overall: ___%
- Target: <5%

Customer Acquisition Cost (CAC):
- Blended CAC: $____
- By tier: PAYGO $__, Small $__, Medium $__, Large $__
- Payback period: ___ months
- Target: <$500

Net Revenue Retention (NRR):
- Current: ___%
- Target: >110%
- Indicates: Expansion vs. churn

Tier Migration:
- PAYGO → Small: __% conversion rate
- Small → Medium: __% conversion rate
- Medium → Large: __% conversion rate
- Target overall: 40-50% annual upgrade rate
```

### Quarterly Metrics
```
Cohort Retention:
- Month 1: __% remaining
- Month 3: __% remaining
- Month 6: __% remaining
- Month 12: __% remaining
- Target: 85-90% by month 6

Customer Lifetime Value (LTV):
- PAYGO: $____
- Small: $____
- Medium: $____
- Large: $____
- Blended: $____

Unit Economics:
- Gross margin by tier: ___%
- CAC:LTV ratio by tier: 1:__
- Payback period: ___ months

Revenue Mix:
- PAYGO: __% of total
- Small: __% of total
- Medium: __% of total
- Large: __% of total
- Enterprise: __% of total
```

---

## Part 7: Competitive Response Strategy

### If Competitor Drops Pricing

**Tier 1 Response (Immediate)**
```
Don't match price immediately
Instead:
1. Highlight bundled value
2. Run promotional campaign
3. Emphasize quality differences
4. Offer limited-time bonuses

Timeline: Within 1 week
Action: Email + homepage banner
Message: "Get 25% MORE assessments (bonus tier upgrade)" vs price cut
```

**Tier 2 Response (If Market Shifts)**
```
Adjust discount structure
- Instead of lowering prices across board
- Add more aggressive volume bonuses
- Extend annual prepay discount from 17% to 20%
- Create limited-time promotional pack

Timeline: Within 1 month
Action: New tier or modified discount
Cost: Minimal margin impact, significant value perception
```

**Tier 3 Response (If Needed)**
```
Only adjust pricing if:
1. Multiple competitors have moved
2. Loss of 20%+ deal pipeline
3. Significant NPS decline

Then:
- Cut lowest tier prices 5-10%
- Add feature differentiation
- Bundle additional services
- Maintain margin discipline

Timeline: After 60-90 days analysis
Action: Surgical pricing cuts, not across-board
```

---

## Part 8: Discount Governance

### Discount Authority Matrix

```
Tier | Standard Price | AE Authority | Manager Authority | VP Authority
-----|----------------|--------------|-------------------|-------------
Pay-as-you-go | $10 | No discount | 10% max | 15% max
Small Pack | $90 | No discount | 10% max | 15% max
Medium Pack | $375 | 10% max | 15% max | 25% max
Large Pack | $1,200 | 15% max | 25% max | 40% max
Enterprise | Custom | 20% max | 30% max | 50% max

Rules:
- No discounts on trial conversions
- First-time discounts only with 12+ month commitment
- Escalate anything >40% to finance
- Maintain minimum 60% gross margin
- Document all discounts >20%
```

### Promotion Calendar

```
Q1: New Year Promo - 10% off prepaid (Jan only)
Q2: Growth Plan Promo - Upgrade to Medium, get 1 month free
Q3: Back to School - 15% off Small/Medium (academic hiring)
Q4: Year-End - 20% off annual subscriptions (commit now)

Rules:
- No more than 4 promotions per year
- Max discount value (margin > 65%)
- Communicate in advance to sales team
- Track promotion effectiveness
```

---

## Part 9: Integration Points

### Accounting System
- Monthly revenue recognition by tier
- Deferred revenue tracking (prepaid packs)
- MRR/ARR calculations
- Unit economics reporting

### CRM System
- Contact record: Current tier, LTV estimate
- Activity: Upsell opportunities
- Reports: Revenue by tier, churn analysis
- Forecasting: Pipeline by tier

### Analytics Platform
- Event tracking: Purchase, tier, discount
- Funnel analysis: Trial → PAYGO → Pack
- Cohort analysis: Retention by entry tier
- Dashboard: Real-time KPI tracking

### Email Platform
- Segmentation by tier
- Upgrade triggers (usage thresholds)
- Renewal reminders (prepaid expiry)
- Upsell sequences

---

## Part 10: Glossary

**Prepaid Credits/Packs**: One-time purchase of N assessments for a fixed price
**Subscription**: Monthly recurring billing for included assessments + overages
**Overage**: Charge per assessment above included limit
**Discount**: Percentage reduction from base $10/assessment price
**ARPU**: Average revenue per user per month/year
**CAC**: Customer acquisition cost (total to acquire one customer)
**LTV**: Customer lifetime value (total revenue over relationship)
**NRR**: Net revenue retention (expansion vs. churn)
**MRR**: Monthly recurring revenue (from subscriptions)
**ARR**: Annual recurring revenue (MRR × 12)
**Cohort**: Group of customers acquired in same time period
**Churn**: Percentage of customers not renewing

