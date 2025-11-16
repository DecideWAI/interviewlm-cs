# Sprint 3: Assessment Management & Platform Polish

## Overview

**Duration**: 5-7 days
**Goal**: Complete the hiring workflow with assessment management, candidate invitations, and dashboard polish
**Status**: 🚀 Ready to Start

---

## Current State Assessment

### ✅ What's Working
- Complete interview experience (code editor, terminal, AI chat)
- Real Modal sandbox execution
- Comprehensive event recording
- Session replay with timeline
- Scoring and evaluation system
- Authentication (NextAuth)

### ⚠️ What's Missing
- Assessment creation/management UI
- Candidate invitation workflow
- Email notifications
- Dashboard with real data (currently mock data)
- Results comparison and ranking
- Organization/team management
- Question bank management

---

## Sprint 3 Objectives

### Primary Goals
1. ✅ Enable interviewers to create and manage assessments
2. ✅ Implement candidate invitation flow with email
3. ✅ Connect dashboard to real Prisma data
4. ✅ Add results comparison and ranking features
5. ✅ Polish UX and fix critical bugs

### Success Criteria
- [ ] Interviewer can create an assessment end-to-end
- [ ] Interviewer can invite candidates via email
- [ ] Dashboard shows real candidate data
- [ ] Interviewer can compare candidates side-by-side
- [ ] All critical UX issues resolved
- [ ] Platform ready for beta testing

---

## Feature Breakdown

### 1. Assessment Management (2-3 days)

#### 1.1 Assessment Creation Page
**Route**: `/assessments/new`

**UI Components**:
- Form with fields:
  - Title (e.g., "Senior Backend Engineer Assessment")
  - Description (rich text)
  - Role (dropdown: backend, frontend, fullstack, mobile, etc.)
  - Seniority (dropdown: junior, mid, senior, lead, principal)
  - Tech stack (multi-select: javascript, python, react, etc.)
  - Duration (slider: 30min - 4 hours)
  - Enable/disable features (coding, terminal, AI)
- Question configuration:
  - Number of questions
  - Difficulty distribution
  - Option to use question bank or generate dynamically
- Preview section
- Save draft / Publish buttons

**API Endpoint**: `POST /api/assessments`

**Validation**:
- Title required, 3-100 chars
- Duration 30-240 minutes
- At least one tech stack selected
- Valid role and seniority combination

**Database**:
- Creates `Assessment` record
- Links to user as `createdBy`
- Links to organization
- Status: DRAFT initially

---

#### 1.2 Assessment Listing Page
**Route**: `/assessments`

**UI Components**:
- Table with columns:
  - Title
  - Role & Seniority
  - Status (Draft/Published/Archived)
  - Candidates (count)
  - Created Date
  - Actions (Edit, Duplicate, Archive)
- Filters:
  - Status
  - Role
  - Date range
- Search by title
- "Create New" button
- Stats cards:
  - Total Assessments
  - Active Assessments
  - Total Candidates
  - Avg Completion Rate

**API Endpoint**: `GET /api/assessments?status=...&role=...`

**Features**:
- Pagination (20 per page)
- Sort by date, title, candidate count
- Quick actions (duplicate, archive)
- Bulk actions (archive multiple)

---

#### 1.3 Assessment Edit Page
**Route**: `/assessments/[id]/edit`

**UI Components**:
- Same form as creation
- Pre-populated with existing data
- "Save Changes" / "Cancel" buttons
- Delete assessment button (with confirmation)
- Version history (optional - future)

**API Endpoint**: `PATCH /api/assessments/[id]`

**Validation**:
- Cannot edit if candidates have started
- Can add questions but not remove
- Can extend duration but not shorten

---

#### 1.4 Assessment Detail Page
**Route**: `/assessments/[id]`

**UI Components**:
- Assessment overview
- Candidate list for this assessment
- Statistics:
  - Completion rate
  - Average score
  - Pass rate
  - Top performers
- Actions:
  - Invite candidates
  - Duplicate assessment
  - View all results
  - Export data (CSV)

**API Endpoint**: `GET /api/assessments/[id]`

---

### 2. Candidate Invitation Flow (1-2 days)

#### 2.1 Invite Candidate Page
**Route**: `/assessments/[id]/invite`

**UI Components**:
- Form with fields:
  - Candidate name
  - Email address
  - Phone (optional)
  - Custom message (pre-filled template)
  - Deadline (optional)
- Bulk invite (CSV upload)
- Email preview
- Send button

**API Endpoint**: `POST /api/assessments/[id]/candidates`

**Flow**:
1. Create `Candidate` record (status: INVITED)
2. Generate unique assessment link
3. Send email via Resend/SendGrid
4. Return invitation sent confirmation

**Email Template**:
```
Subject: You're invited to complete a technical assessment

Hi {name},

{company_name} has invited you to complete a technical assessment for the {role} position.

Assessment Details:
- Duration: {duration} minutes
- Topics: {tech_stack}
- Deadline: {deadline}

You'll have access to:
- Modern code editor with syntax highlighting
- Terminal for running commands
- AI assistant (Claude) for help
- Real-time test execution

Click here to start: {assessment_link}

This link is unique to you and will expire on {deadline}.

Good luck!
{company_name} Hiring Team
```

---

#### 2.2 Candidate Landing Page
**Route**: `/interview/start/[token]`

**UI Components**:
- Welcome message
- Assessment details
- Time limit reminder
- Instructions
- "Start Assessment" button
- FAQ accordion

**Flow**:
1. Verify token validity
2. Check if already completed
3. Check deadline
4. Show instructions
5. On "Start" → redirect to `/interview/[id]`

**API Endpoint**: `GET /api/candidates/verify/{token}`

---

#### 2.3 Email Service Integration

**Provider**: Resend (or SendGrid/AWS SES)

**Service**: `lib/services/email.ts`

**Functions**:
- `sendInvitationEmail(candidate, assessment, link)`
- `sendReminderEmail(candidate, hoursLeft)`
- `sendCompletionEmail(candidate, score)`
- `sendInterviewerNotification(interviewer, candidate)`

**Templates**:
- Invitation email
- Reminder email (24h before deadline)
- Completion confirmation
- Interviewer notification (when candidate completes)

**Implementation**:
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendInvitationEmail(
  candidate: Candidate,
  assessment: Assessment,
  token: string
) {
  const link = `${process.env.NEXT_PUBLIC_URL}/interview/start/${token}`

  await resend.emails.send({
    from: 'hiring@interviewlm.com',
    to: candidate.email,
    subject: `You're invited: ${assessment.title}`,
    html: InvitationEmailTemplate({ candidate, assessment, link }),
  })
}
```

---

### 3. Dashboard with Real Data (1-2 days)

#### 3.1 Update Dashboard API
**Endpoint**: `GET /api/dashboard/stats`

**Returns**:
- Active assessments count
- Pending review count
- Completed this month
- Average score
- Completion rate
- Pass rate
- AI proficiency metrics
- Recent candidates (with real data)
- Pipeline funnel (with real data)

**Implementation**:
```typescript
export async function GET() {
  const session = await getSession()

  // Get user's organization
  const org = await prisma.organization.findFirst({
    where: {
      members: { some: { userId: session.user.id } }
    }
  })

  // Aggregate stats
  const stats = await prisma.candidate.aggregate({
    where: { organizationId: org.id },
    _count: { id: true },
    _avg: { overallScore: true },
  })

  // Get recent candidates
  const candidates = await prisma.candidate.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      assessment: true,
      sessionRecording: true,
    }
  })

  return NextResponse.json({ stats, candidates })
}
```

---

#### 3.2 Update Dashboard Components

**Replace Mock Data**:
- `MOCK_DASHBOARD_KPIS` → Real data from API
- `MOCK_CANDIDATES` → Real candidate data
- `MOCK_PIPELINE_FUNNEL` → Calculated from real data
- `MOCK_PRIORITY_ACTIONS` → Generated from candidate states

**Components to Update**:
- `app/dashboard/page.tsx` - Main dashboard
- `components/analytics/KPICard.tsx` - Show real numbers
- `components/analytics/CandidateTable.tsx` - Real candidates
- `components/analytics/PipelineFunnelChart.tsx` - Real conversion

---

### 4. Results Comparison (1 day)

#### 4.1 Candidate Comparison Page
**Route**: `/candidates/compare?ids=...`

**UI Components**:
- Side-by-side comparison (2-4 candidates)
- Metrics comparison:
  - Overall score (with radar chart)
  - Code quality
  - AI collaboration
  - Problem solving
  - Test pass rate
  - Time efficiency
- Code diff viewer (compare solutions)
- AI chat comparison
- Session replay links
- Recommendation summary

**API Endpoint**: `GET /api/candidates/compare?ids=c1,c2,c3`

---

#### 4.2 Ranking and Filtering

**Candidate List Enhancements**:
- Sort by score, date, AI usage
- Filter by score range, flags, status
- Tag candidates (top performer, needs review, rejected)
- Bulk actions (move to next stage, reject)

---

### 5. Polish & UX Improvements (1-2 days)

#### 5.1 Critical Fixes
- [ ] Fix timer not starting automatically
- [ ] Add confirmation before leaving interview
- [ ] Improve file tree UX (icons, expand/collapse all)
- [ ] Add keyboard shortcuts (Ctrl+S to save, etc.)
- [ ] Better error messages
- [ ] Loading states for all async operations
- [ ] Optimize bundle size

#### 5.2 Interview Experience Polish
- [ ] Add progress indicator (% complete)
- [ ] Show test results inline in editor
- [ ] Syntax error highlighting
- [ ] Auto-format code button
- [ ] Dark/light theme toggle (currently only dark)
- [ ] Adjust code editor font size
- [ ] Terminal history (up arrow for previous commands)

#### 5.3 Dashboard Polish
- [ ] Add charts for trends (scores over time)
- [ ] Export to CSV/PDF
- [ ] Shareable candidate profiles
- [ ] Print-friendly results page
- [ ] Mobile-responsive improvements

#### 5.4 Performance Optimization
- [ ] Lazy load dashboard components
- [ ] Optimize session replay loading
- [ ] Add pagination to candidate lists
- [ ] Cache frequently accessed data
- [ ] Compress large payloads

---

## Implementation Order

### Day 1-2: Assessment Management
1. Create assessment creation API
2. Build assessment creation page
3. Build assessment listing page
4. Add edit functionality
5. Test complete CRUD flow

### Day 3-4: Candidate Invitation
1. Set up email service (Resend)
2. Create invitation API
3. Build invite page UI
4. Create email templates
5. Build candidate landing page
6. Test end-to-end invitation flow

### Day 5-6: Dashboard & Results
1. Create dashboard stats API
2. Update dashboard to use real data
3. Build candidate comparison page
4. Add ranking and filtering
5. Test with real candidate data

### Day 7: Polish & Testing
1. Fix critical UX issues
2. Add loading states
3. Optimize performance
4. Manual E2E testing
5. Bug fixes
6. Documentation updates

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/assessments | Create assessment |
| GET | /api/assessments | List assessments |
| GET | /api/assessments/[id] | Get assessment details |
| PATCH | /api/assessments/[id] | Update assessment |
| DELETE | /api/assessments/[id] | Delete assessment |
| POST | /api/assessments/[id]/candidates | Invite candidate |
| GET | /api/candidates/verify/{token} | Verify invitation token |
| GET | /api/dashboard/stats | Dashboard statistics |
| GET | /api/candidates/compare | Compare candidates |

---

## Database Schema Updates

### New Fields Needed

**Candidate Table**:
- `invitationToken` (unique)
- `invitationSentAt` (datetime)
- `invitationExpiresAt` (datetime)
- `deadlineAt` (datetime, optional)

**Assessment Table**:
- `techStack` (array of strings)
- Already have all other fields

### Migrations Required

```sql
-- Add invitation fields to Candidate
ALTER TABLE candidates
ADD COLUMN invitation_token VARCHAR(255) UNIQUE,
ADD COLUMN invitation_sent_at TIMESTAMP,
ADD COLUMN invitation_expires_at TIMESTAMP,
ADD COLUMN deadline_at TIMESTAMP;

-- Add index for faster token lookups
CREATE INDEX idx_candidates_invitation_token ON candidates(invitation_token);

-- Add tech stack to Assessment (if not exists)
ALTER TABLE assessments
ADD COLUMN tech_stack TEXT[] DEFAULT '{}';
```

---

## Third-Party Services

### Email Service (Resend)

**Setup**:
1. Sign up at resend.com
2. Verify domain
3. Get API key
4. Add to `.env.local`: `RESEND_API_KEY=...`

**Pricing**: Free tier - 100 emails/day

**Alternative**: SendGrid, AWS SES

---

## Success Metrics

After Sprint 3, the platform should achieve:

✅ **Functional Completeness**
- Interviewer can create assessment → invite candidate → candidate takes interview → interviewer reviews results

✅ **User Experience**
- Smooth onboarding for candidates
- Intuitive assessment creation
- Clear results presentation
- Fast page loads (<2s)

✅ **Technical Quality**
- No critical bugs
- 80%+ test coverage
- Clean code architecture
- Production-ready

---

## Risks & Mitigation

### Risk 1: Email Deliverability
**Impact**: Invitations not reaching candidates
**Mitigation**:
- Use reputable provider (Resend)
- Verify domain with SPF/DKIM
- Test with multiple email providers
- Add fallback (show link in UI)

### Risk 2: Complex Assessment Creation UX
**Impact**: Interviewers confused, low adoption
**Mitigation**:
- Start with simple form
- Add wizard/stepper UI
- Provide templates
- In-app guidance

### Risk 3: Performance with Large Datasets
**Impact**: Dashboard slow with 1000+ candidates
**Mitigation**:
- Implement pagination early
- Add database indices
- Cache aggregated stats
- Optimize queries

---

## Post-Sprint 3 Roadmap

After Sprint 3, the platform will be ready for:

**Sprint 4: Production Deployment**
- Infrastructure setup (Vercel, Database, S3)
- Environment configuration
- Monitoring and alerting
- Beta user onboarding

**Sprint 5: Advanced Features**
- Custom question banks
- Team collaboration
- Advanced analytics
- Video recording integration
- Slack/email notifications

**Sprint 6: Scale & Optimize**
- Load testing
- Cost optimization
- Security audit
- Performance tuning
- Multi-tenancy enhancements

---

## Getting Started

To begin Sprint 3 implementation:

```bash
# 1. Create new branch (if needed)
git checkout -b sprint-3-assessment-management

# 2. Install email service
npm install resend

# 3. Create migration for new fields
npx prisma migrate dev --name add_invitation_fields

# 4. Create API routes directory
mkdir -p app/api/assessments

# 5. Start with assessment creation
# File: app/api/assessments/route.ts
```

---

**Ready to Start Sprint 3!** 🚀

**Estimated Completion**: 5-7 days from start
**Priority**: HIGH - Blocking beta launch
**Dependencies**: Resend API key, Email templates

Let's build an amazing assessment management experience!
