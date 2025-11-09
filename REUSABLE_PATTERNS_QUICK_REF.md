# InterviewLM - Quick Reference: Reusable Patterns & Components

## FASTEST WAY TO BUILD NEW PAGES

### 1. Building a List Page (like Candidates)
**Copy from**: `/app/candidates/page.tsx`

**Time to build**: 30 minutes
```tsx
// Use these in sequence:
1. DashboardLayout wrapper
2. PageHeader (title + description)
3. Stat cards grid (4 columns)
4. Filter badges row
5. Search + advanced filters bar
6. Table or Card view (toggle)
7. Wire to mock data
```

**Components needed**:
- DashboardLayout, PageHeader, Button, Input, Select, Badge
- CandidateTable (or build similar table)

**Styling**: All exist in Tailwind - just reuse class patterns

---

### 2. Building a Detail Page with Tabs
**Copy from**: `/app/problems/seeds/[id]/page.tsx`

**Time to build**: 45 minutes
```tsx
// Use these in sequence:
1. DashboardLayout wrapper
2. Header with back button + title + badge
3. Action buttons row
4. Quick stats cards (5 columns)
5. Tab navigation (custom state)
6. Tab content sections
```

**Key decision**: Use manual tab state or refactor to use Tabs component
- Manual (current): `useState("overview")`
- Component: `<Tabs>` from `/components/ui/tabs.tsx`

---

### 3. Building a Detail Page with Sections (Like Candidate Profile)
**Copy from**: `/app/candidates/[id]/page.tsx`

**Time to build**: 60 minutes
```tsx
// Use these in sequence:
1. DashboardLayout wrapper
2. Header section with back button
3. Gradient score card (5 metrics)
4. Two-column layout (lg:grid-cols-3)
5. Left column: performance sections
6. Right column: sidebar (flags, timeline)
```

**Key patterns**:
- Score display: `bg-gradient-to-br from-primary/10 to-primary/5`
- Flag cards: `bg-error/5 border border-error/20` (or success)
- Timeline: Use flex + circle icons + vertical line

---

### 4. Building an Analytics Dashboard
**Copy from**: `/app/analytics/page.tsx`

**Time to build**: 90 minutes
```tsx
// Use these in sequence:
1. PageHeader with date range selector
2. KPI metric cards (4 columns with trends)
3. Actionable insights section
4. Multi-panel grid (2x2 or custom)
5. Chart visualizations
6. Recommendation cards
```

**Mock data available**:
- MOCK_DASHBOARD_KPIS (metrics + trends)
- MOCK_ACTIONABLE_INSIGHTS (insights with severity)
- MOCK_TREND_DATA (for charts)
- MOCK_OPTIMIZATION_RECOMMENDATIONS (recommendation cards)

---

## COMPONENT CHEAT SHEET

### Always Available UI Components
```tsx
// Buttons
<Button variant="primary|secondary|ghost|danger|success|outline|link" size="sm|md|lg|xl|icon">
<Button loading={true} disabled={true}>

// Status Labels
<Badge variant="default|primary|success|warning|error|info">

// Form Fields
<Input placeholder="..." />
<Textarea placeholder="..." rows={3} />
<Select><option>...</option></Select>
<Checkbox>
<Label>

// Containers
<Card><CardContent>...</CardContent></Card>

// Progress
<Progress value={45} />

// Tables
<Table>
  <TableHeader><TableRow><TableHead></TableHead></TableRow></TableHeader>
  <TableBody><TableRow><TableCell></TableCell></TableRow></TableBody>
</Table>

// Layout
<DashboardLayout>...</DashboardLayout>
<PageHeader title="..." description="..." />
<Container>...</Container>

// Others
<Avatar size="sm|md|lg" fallback="JD" src="..." />
<Dialog>...</Dialog>
<Spinner />
<EmptyState />
```

---

## COLOR PATTERNS (Use These!)

### Status/Severity
```tsx
// Success (green)
<div className="bg-success/5 border border-success/20">
  <h3 className="text-success">

// Warning (amber)
<div className="bg-warning/5 border border-warning/20">
  <h3 className="text-warning">

// Error (red)
<div className="bg-error/5 border border-error/20">
  <h3 className="text-error">

// Info (blue)
<div className="bg-info/5 border border-info/20">
  <h3 className="text-info">
```

### Card Styling
```tsx
// Standard card
className="bg-background-secondary border border-border rounded-lg p-4 hover:border-primary/40 transition-all"

// Gradient card (scores)
className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-8"
```

### Text
```tsx
text-text-primary      // Headings
text-text-secondary    // Body
text-text-tertiary     // Labels
text-text-muted        // Disabled/subtle
```

---

## QUICK COPY-PASTE BLOCKS

### Stat Cards (4-Column Grid)
```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  {[
    { label: "Total", value: 123, icon: Users, color: "primary" },
    { label: "In Progress", value: 45, icon: Clock, color: "info" },
    { label: "Completed", value: 78, icon: CheckCircle2, color: "success" },
    { label: "Needs Review", value: 12, icon: AlertTriangle, color: "warning" },
  ].map((stat, i) => (
    <div key={i} className="bg-background-secondary border border-border rounded-lg p-4 hover:border-primary/40 transition-all">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-text-tertiary">{stat.label}</p>
        <stat.icon className={`h-5 w-5 text-${stat.color}`} />
      </div>
      <p className="text-3xl font-bold text-text-primary">{stat.value}</p>
    </div>
  ))}
</div>
```

### Filter Bar (with Collapsible Filters)
```tsx
const [showFilters, setShowFilters] = useState(false);

<div className="bg-background-secondary border border-border rounded-lg p-4">
  <div className="flex items-center gap-3 flex-wrap">
    <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
    <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
      <Filter className="h-4 w-4 mr-2" /> Filters
    </Button>
    <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Export</Button>
  </div>
  
  {showFilters && (
    <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-down">
      <Select className="w-full"><option>Filter 1</option></Select>
      <Select className="w-full"><option>Filter 2</option></Select>
      <Select className="w-full"><option>Filter 3</option></Select>
      <Button variant="outline" onClick={() => setShowFilters(false)}>Clear</Button>
      <Button variant="primary">Apply</Button>
    </div>
  )}
</div>
```

### Two-Column Detail Layout
```tsx
<div className="grid lg:grid-cols-3 gap-6">
  {/* Main content - left 2 columns */}
  <div className="lg:col-span-2 space-y-6">
    {/* Sections here */}
  </div>
  
  {/* Sidebar - right 1 column */}
  <div className="space-y-6">
    {/* Flags, timeline, etc */}
  </div>
</div>
```

### Tab Navigation (Manual)
```tsx
const [activeTab, setActiveTab] = useState("overview");

<div className="bg-background-secondary border border-border rounded-lg">
  <div className="border-b border-border px-6">
    <div className="flex items-center gap-6">
      {["overview", "details", "analytics"].map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            "py-4 border-b-2 transition-colors text-sm font-medium capitalize",
            activeTab === tab
              ? "border-primary text-primary"
              : "border-transparent text-text-tertiary hover:text-text-secondary"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  </div>
  
  <div className="p-6">
    {activeTab === "overview" && <OverviewContent />}
    {activeTab === "details" && <DetailsContent />}
    {activeTab === "analytics" && <AnalyticsContent />}
  </div>
</div>
```

### Score Card with Gradient
```tsx
<div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-8">
  <div className="grid md:grid-cols-5 gap-6">
    <div className="text-center">
      <p className="text-sm text-text-tertiary mb-2">Overall Score</p>
      <p className="text-5xl font-bold text-primary mb-2">{score}</p>
      <p className="text-xs text-text-muted">out of 100</p>
    </div>
    {/* More metrics */}
  </div>
</div>
```

---

## MOCK DATA QUICK ACCESS

```tsx
// Candidates
import { MOCK_CANDIDATES } from "@/lib/mock-analytics-data"
// Use: const candidate = MOCK_CANDIDATES.find(c => c.id === id)

// Problem Seeds
import { MOCK_PROBLEM_SEEDS, getSeedStats } from "@/lib/mock-seeds-data"
// Use: const stats = getSeedStats()

// Analytics
import { MOCK_DASHBOARD_KPIS, MOCK_SOURCE_EFFECTIVENESS } from "@/lib/mock-analytics-data"
import { MOCK_ACTIONABLE_INSIGHTS, MOCK_OPTIMIZATION_RECOMMENDATIONS, MOCK_TREND_DATA, MOCK_PERFORMANCE_BY_ROLE } from "@/lib/mock-insights-data"

// Config
import { ROLES, SENIORITY_LEVELS } from "@/lib/assessment-config"
```

---

## FILE PATHS YOU'LL REUSE

```
Components to import:
  @/components/layout/dashboard-layout
  @/components/layout/page-header
  @/components/ui/button
  @/components/ui/badge
  @/components/ui/card
  @/components/ui/input
  @/components/ui/select
  @/components/ui/progress
  @/components/ui/table
  @/components/analytics/CandidateTable

Types to import:
  @/types/analytics (CandidateProfile, DashboardKPIs, etc.)
  @/types/assessment (AssessmentConfig, Role, SeniorityLevel, etc.)

Data to import:
  @/lib/mock-analytics-data
  @/lib/mock-seeds-data
  @/lib/mock-insights-data
  @/lib/assessment-config
  @/lib/utils (cn function)
```

---

## COMMON PATTERNS SUMMARY

| Need | File to Copy | Time |
|------|--------------|------|
| New list page | `/app/candidates/page.tsx` | 30 min |
| New detail with tabs | `/app/problems/seeds/[id]/page.tsx` | 45 min |
| New detail with sections | `/app/candidates/[id]/page.tsx` | 60 min |
| New dashboard | `/app/analytics/page.tsx` | 90 min |
| New stat card | N/A (template above) | 5 min |
| New filter bar | N/A (template above) | 10 min |

---

## THINGS TO REMEMBER

1. **Always use DashboardLayout** - wraps sidebar + header
2. **Use lg:grid-cols-3 for detail pages** - gives 2/3 and 1/3 split
3. **Use grid grid-cols-1 md:grid-cols-4 for stat cards** - responsive 4-column
4. **Use grid grid-cols-1 lg:grid-cols-2 for analytics panels** - 2-column grid
5. **Status colors**: Use `/5` opacity background + full opacity text
6. **Hover states**: `hover:border-primary/40 transition-all`
7. **Spacing**: Use `space-y-6` for vertical sections, `gap-4` for grid
8. **Text hierarchy**: primary > secondary > tertiary > muted

