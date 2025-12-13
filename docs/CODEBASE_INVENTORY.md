# InterviewLM Codebase Inventory - Reusable Components & Patterns

## 1. EXISTING PAGE PATTERNS

### List View Pattern (Reusable)
- **File**: `/home/user/interviewlm-cs/app/candidates/page.tsx`
- **Pattern Elements**:
  - PageHeader with title + description
  - Stat cards grid (4 columns with icons and trends)
  - Smart filter badges (quick filter shortcuts)
  - Search + advanced filters bar with collapsible filters
  - Dual view modes (table/cards toggle)
  - Export/Import buttons
  - Table or Card grid view
- **Reused In**: Candidates list, Problem Seeds list, Assessments list
- **Key Classes**: Layout uses `grid grid-cols-1 md:grid-cols-4 gap-4` for stat cards

### Detail View with Tabs Pattern (Reusable)
- **File**: `/home/user/interviewlm-cs/app/problems/seeds/[id]/page.tsx`
- **Pattern Elements**:
  - Back button + title with status badge
  - Action buttons (Duplicate, Edit, Preview)
  - Quick stats cards (5 columns with metadata)
  - Tabbed content area (Overview, Instructions, Analytics)
  - Custom tab implementation (manual state management)
  - Tab content sections with various layouts
- **Key Components**: DashboardLayout, Badge, Button, Progress bars
- **Uses**: Manual tab state (`useState("overview")`)

### Detail View with Sections Pattern (Reusable)
- **File**: `/home/user/interviewlm-cs/app/candidates/[id]/page.tsx`
- **Pattern Elements**:
  - Header with back button, title, and status badge
  - Action buttons (Leave Note, View Session)
  - Gradient card with score display (5 metrics in grid)
  - Two-column layout (lg:grid-cols-3, left 2 cols, right 1 col)
  - Performance metrics section with Progress bars
  - AI usage analysis cards
  - Strengths/weaknesses split view
  - Sidebar with flags (red/green), timeline
- **Key Components**: Progress, Badge, colored alert sections

### Dashboard/Analytics Pattern (Reusable)
- **File**: `/home/user/interviewlm-cs/app/analytics/page.tsx`
- **Pattern Elements**:
  - Page header with date range selector
  - KPI metric cards (4 columns with trends)
  - Actionable insights section with severity badges
  - Multi-panel grid layout (2x2 or custom)
  - Trend chart with SVG visualization
  - Performance row components with inline progress bars
  - Recommendation cards with priority coloring
- **Components Used**: Card, Badge, Button, custom SVG charts

---

## 2. REUSABLE COMPONENTS

### UI Components Library (`/components/ui/`)

| Component | File | Purpose | Variants |
|-----------|------|---------|----------|
| Button | button.tsx | CTA, actions | primary, secondary, ghost, danger, success, outline, link |
| Badge | badge.tsx | Status labels, tags | default, primary, success, warning, error, info |
| Card | card.tsx | Container with rounded corners | - |
| Input | input.tsx | Text input fields | - |
| Textarea | textarea.tsx | Multi-line text input | - |
| Select | select.tsx | Dropdown selection | - |
| Checkbox | checkbox.tsx | Toggle selection | - |
| Progress | progress.tsx | Progress bars | - |
| Tabs | tabs.tsx | Tab navigation | Custom (manual) or component-based |
| Table | table.tsx | Data tables | TableHeader, TableBody, TableRow, TableHead, TableCell |
| Avatar | avatar.tsx | User avatars | - |
| Dialog | dialog.tsx | Modal dialogs | - |
| Label | label.tsx | Form labels | - |
| Spinner | spinner.tsx | Loading indicator | - |
| EmptyState | empty-state.tsx | Empty state UI | - |

### Layout Components (`/components/layout/`)

| Component | File | Purpose |
|-----------|------|---------|
| DashboardLayout | dashboard-layout.tsx | Main layout wrapper (sidebar + header + content) |
| Sidebar | sidebar.tsx | Left navigation sidebar |
| Header | header.tsx | Top navigation header |
| PageHeader | page-header.tsx | Page title + description |
| Container | container.tsx | Content width constraint |

### Analytics Components (`/components/analytics/`)

| Component | File | Purpose | Key Features |
|-----------|------|---------|--------------|
| CandidateTable | CandidateTable.tsx | Tabular candidate display | Search, status filter, sort by date/score |
| KPICard | KPICard.tsx | Key performance indicator | Trend arrow, status color, comparison text |
| PipelineFunnelChart | PipelineFunnelChart.tsx | Funnel visualization | Conversion stages |
| PriorityActionsPanel | PriorityActionsPanel.tsx | Action items dashboard | Severity levels, action links |

### Assessment Components (`/components/assessment/`)

| Component | File | Purpose |
|-----------|------|---------|
| AssessmentWizard | AssessmentWizard.tsx | Multi-step wizard for assessment creation |
| (Wizard Steps) | wizard-steps/ | Individual step components |

---

## 3. DATA TYPES

### Main Types File: `/home/user/interviewlm-cs/types/assessment.ts`
```
- Role (enum): backend, frontend, fullstack, database, security, ml, custom
- SeniorityLevel (enum): junior, mid, senior, staff, principal
- AssessmentStatus (enum): draft, active, completed, archived
- DifficultyLevel (enum): easy, medium, hard
- QuestionSeed, AssessmentTemplate, AssessmentConfig, AssessmentWizardState
- RoleMetadata, SeniorityMetadata, TierLimits
```

### Analytics Types File: `/home/user/interviewlm-cs/types/analytics.ts`
```
- CandidateStatus (enum): invited, assessment_sent, assessment_in_progress, assessment_completed, under_review, etc.
- PipelineStage (enum): sourcing, screening, assessment, interview, decision, offer, closed
- CandidateProfile: Complete candidate data with scores, flags, timeline
- Flag: Red/green flags with severity
- DashboardKPIs: Key performance metrics
- KPI: Individual metric with trend
- PipelineFunnel, FunnelStage, AssessmentAnalytics, TimeSeriesData
- CandidateComparison, ScoringRubric, AICollaborationScore
- SessionAnalytics, HiringRecommendation, PriorityAction, DashboardFilters
- SourceEffectiveness
```

---

## 4. MOCK DATA AVAILABLE

### `/home/user/interviewlm-cs/lib/mock-analytics-data.ts`
- `MOCK_CANDIDATES`: Full candidate profiles with all scores and metadata
- `MOCK_DASHBOARD_KPIS`: KPI values with trends
- `MOCK_SOURCE_EFFECTIVENESS`: Source ROI analysis
- `MOCK_PIPELINE_FUNNEL`: Stage conversion data
- Contains scoring utilities: `detectRedFlags()`, `detectGreenFlags()`, `calculateOverallScore()`, `calculateAICollaborationScore()`

### `/home/user/interviewlm-cs/lib/mock-seeds-data.ts`
- `MOCK_PROBLEM_SEEDS`: Array of problem seed objects with full metadata
- `getSeedStats()`: Function to calculate aggregate statistics
- `EnhancedQuestionSeed` type

### `/home/user/interviewlm-cs/lib/mock-insights-data.ts`
- `MOCK_ACTIONABLE_INSIGHTS`: Insight objects with severity, type, impact
- `MOCK_OPTIMIZATION_RECOMMENDATIONS`: Recommendation cards with priority
- `MOCK_TREND_DATA`: Time-series data for charts
- `MOCK_PERFORMANCE_BY_ROLE`: Role-based performance metrics

### `/home/user/interviewlm-cs/lib/assessment-config.ts`
- `ROLES`: Role metadata with descriptions and defaults
- `SENIORITY_LEVELS`: Seniority metadata with difficulty distributions
- `ASSESSMENT_TEMPLATES`: Pre-built templates
- `TIER_LIMITS`: Feature limits by pricing tier

---

## 5. EXISTING PAGES (Built)

✅ `/app/page.tsx` - Landing page
✅ `/app/dashboard/page.tsx` - Dashboard home
✅ `/app/candidates/page.tsx` - Candidate list
✅ `/app/candidates/[id]/page.tsx` - Candidate detail
✅ `/app/problems/page.tsx` - Problem seeds list
✅ `/app/problems/seeds/[id]/page.tsx` - Problem seed detail
✅ `/app/problems/seeds/new/page.tsx` - New problem seed form
✅ `/app/assessments/page.tsx` - Assessment list
✅ `/app/assessments/new/page.tsx` - New assessment wizard
✅ `/app/assessments/[id]/preview/page.tsx` - Assessment preview
✅ `/app/analytics/page.tsx` - Analytics dashboard
✅ `/app/settings/page.tsx` - Settings page
✅ `/app/auth/signin/page.tsx` - Sign in
✅ `/app/auth/signup/page.tsx` - Sign up
✅ `/app/interview/demo/page.tsx` - Demo interview
✅ `/app/interview/[id]/page.tsx` - Live interview
✅ `/app/pricing/page.tsx` - Pricing page

---

## 6. MISSING/INCOMPLETE PIECES

### Pages/Routes That May Be Missing:
- Assessment detail/overview page (before candidates run it)
- Session playback/replay page (to review candidate session)
- Team management page (if multi-user)
- Billing/subscription management
- Integration settings

### Components That Need Building:
- Session playback player (replay code editor + terminal + chat)
- Advanced reporting/export components
- More sophisticated charts (D3, recharts, or similar)
- Calendar/scheduling components (for interview scheduling)
- Notification center
- Batch operations UI (bulk invite, export)

### Enhancements Needed:
- Actual Tabs component (not manual state) - use UI Tabs component properly
- Chart library integration (currently just SVG mockups)
- Data virtualization for large lists (virtualized tables)
- Real API integration (currently all mock data)
- Session recording/playback system
- WebSocket integration for live updates

---

## 7. COLOR & STYLING PATTERNS

### Background Layers
```
bg-background           #000000 - Base
bg-background-secondary #0A0A0A - Cards/panels
bg-background-tertiary  #121212 - Inputs/hovers
bg-background-hover     #1A1A1A - Interactive hover
```

### Text Hierarchy
```
text-text-primary       #FFFFFF - Headings
text-text-secondary     #9CA3AF - Body text
text-text-tertiary      #6B7280 - Labels
text-text-muted         #4B5563 - Disabled
```

### Status Colors
```
Success: #10B981 (bg-success, text-success)
Warning: #F59E0B (bg-warning, text-warning)
Error:   #EF4444 (bg-error, text-error)
Info:    #3B82F6 (bg-info, text-info)
Primary: #5E6AD2 (bg-primary, text-primary)
```

---

## 8. REUSABLE PATTERNS FOR BUILDING NEW PAGES

### Quick Stats Card Block
```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <div className="bg-background-secondary border border-border rounded-lg p-4 hover:border-primary/40 transition-all">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm text-text-tertiary">Label</p>
      <IconComponent className="h-5 w-5 text-primary" />
    </div>
    <p className="text-3xl font-bold text-text-primary">{value}</p>
    <p className="text-xs text-text-muted mt-1">Subtitle</p>
  </div>
</div>
```

### Filter Bar Pattern
```tsx
<div className="bg-background-secondary border border-border rounded-lg p-4">
  <div className="flex items-center gap-3 flex-wrap">
    <Input placeholder="Search..." />
    <Button variant="outline"><Filter ... /></Button>
    <Button variant="outline"><Download ... /></Button>
  </div>
  {showFilters && (
    <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Filter controls */}
    </div>
  )}
</div>
```

### Score Display Card Pattern
```tsx
<div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-8">
  <div className="grid md:grid-cols-5 gap-6">
    {/* Score metrics */}
  </div>
</div>
```

### Two-Column Layout Pattern (Detail Page)
```tsx
<div className="grid lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 space-y-6">
    {/* Main content */}
  </div>
  <div className="space-y-6">
    {/* Sidebar */}
  </div>
</div>
```

### Flag Card Pattern
```tsx
{candidate.redFlags.length > 0 && (
  <div className="bg-error/5 border border-error/20 rounded-lg p-6">
    <h3 className="text-lg font-semibold text-error mb-4 flex items-center gap-2">
      <AlertTriangle className="h-5 w-5" />
      Red Flags ({candidate.redFlags.length})
    </h3>
    {/* Flag items */}
  </div>
)}
```

### Timeline Pattern
```tsx
<div className="space-y-4">
  {events.map((event) => (
    <div className="flex gap-3" key={event.id}>
      <div className="flex flex-col items-center">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 w-px bg-border mt-2"></div>
      </div>
      <div className="pb-4">
        <p className="text-sm font-medium text-text-primary">{event.label}</p>
        <p className="text-xs text-text-tertiary">{event.date}</p>
      </div>
    </div>
  ))}
</div>
```

---

## 9. INTEGRATION POINTS (Data Flow)

### Assessment → Candidates
- Candidates.appliedRole → Assessment.role
- Candidates.assessmentId → Assessment.id
- Candidates.status tracks assessment progress

### Candidates → Analytics
- CandidateProfile scores feed KPI calculations
- Candidate flags contribute to insights
- Candidate sources drive source effectiveness

### Problem Seeds → Assessments
- Problem seeds are templates for assessments
- Seeds have role/seniority requirements
- Assessment can have multiple seeds

### Navigation Flow
```
Dashboard (overview KPIs)
├── Assessments (list + create)
│   └── Assessment Detail (preview/edit)
├── Candidates (list)
│   └── Candidate Detail (scores, flags, timeline)
├── Problems (seeds list)
│   └── Seed Detail (instructions, analytics)
├── Analytics (insights, trends, recommendations)
└── Settings (configuration)
```

---

## 10. IMPORTANT UTILITIES & HELPERS

### `/home/user/interviewlm-cs/lib/utils.ts`
- `cn()` - Classname merger (for conditional styling)

### `/home/user/interviewlm-cs/lib/scoring.ts`
- Scoring calculation functions
- Flag detection logic
- AI collaboration analysis

### Type Imports
```tsx
import { CandidateProfile, DashboardKPIs } from "@/types/analytics"
import { AssessmentConfig } from "@/types/assessment"
import { ROLES, SENIORITY_LEVELS } from "@/lib/assessment-config"
```

---

## SUMMARY TABLE

| Feature | Status | Location |
|---------|--------|----------|
| List view pattern | ✅ Complete | candidates/page.tsx |
| Detail with tabs | ✅ Complete | problems/seeds/[id]/page.tsx |
| Detail with sections | ✅ Complete | candidates/[id]/page.tsx |
| Analytics dashboard | ✅ Complete | analytics/page.tsx |
| UI components | ✅ Complete | components/ui/ |
| Layout components | ✅ Complete | components/layout/ |
| Analytics components | ✅ Partial | components/analytics/ (4 components) |
| Assessment wizard | ✅ Complete | components/assessment/ |
| Data types | ✅ Complete | types/ |
| Mock data | ✅ Complete | lib/mock-*.ts |
| Utility functions | ✅ Complete | lib/ |
| Navigation | ✅ Complete | sidebar.tsx |
| Session playback | ❌ Missing | - |
| Advanced charts | ❌ Missing | - |
| Calendar/scheduling | ❌ Missing | - |

