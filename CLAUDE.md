# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InterviewLM is an AI-native technical assessment platform that evaluates candidates' ability to use modern AI coding tools (like Claude Code) in realistic development environments. The platform provides secure sandboxes where candidates solve coding problems with AI assistance, while the system monitors and analyzes their problem-solving approach, AI prompt quality, and code quality.

## Technology Stack

- **Framework**: Next.js 15 (React 19, App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom pitch-black theme (Linear-inspired)
- **Code Editor**: CodeMirror 6 with custom theme
- **Terminal**: xterm.js with FitAddon and WebLinksAddon
- **UI Components**: Custom component library in `components/ui/`
- **Resizable Layouts**: react-resizable-panels
- **Icons**: lucide-react

## Development Commands

```bash
# Install dependencies
npm install

# Run development server (http://localhost:3000)
npm run dev

# Build production bundle
npm build

# Run production build locally
npm start

# Lint code
npm run lint
```

## Architecture

### App Structure (Next.js App Router)

The application follows Next.js 15 App Router conventions:

- **`app/page.tsx`**: Landing page with hero, features, pricing, FAQ
- **`app/interview/[id]/page.tsx`**: Live interview session (dynamic route)
- **`app/interview/demo/page.tsx`**: Demo interview experience
- **`app/dashboard/page.tsx`**: Assessment management dashboard
- **`app/assessments/page.tsx`**: Assessment creation and listing
- **`app/pricing/page.tsx`**: Pricing page
- **`app/auth/signin/page.tsx`** and **`app/auth/signup/page.tsx`**: Authentication pages
- **`app/layout.tsx`**: Root layout

### Core Interview Experience Components

Located in `components/interview/`:

1. **CodeEditor.tsx**: CodeMirror 6 wrapper with custom pitch-black theme
   - Supports JavaScript, TypeScript, Python, Go
   - Line numbers, syntax highlighting, bracket matching, autocompletion
   - Custom theme matching the pitch-black design system

2. **Terminal.tsx**: xterm.js terminal emulator
   - **IMPORTANT**: Must be dynamically imported with `{ ssr: false }` due to xterm.js requiring client-side only
   - FitAddon for responsive sizing
   - Custom welcome message shows "Connected to Modal AI Sandbox" and "Claude Code CLI initialized"
   - Terminal refs expose `write()` and `writeln()` methods for programmatic output

3. **AIChat.tsx**: Chat interface for Claude Code AI
   - Message history with role-based UI (user/assistant)
   - Copy-to-clipboard for AI responses
   - Markdown/code block rendering support
   - Loading state with animated dots

4. **FileTree.tsx**: File explorer sidebar (referenced but not read in detail)

### Interview Session Layout

The interview experience (`app/interview/demo/page.tsx`) uses a three-panel layout:

```
┌─────────────────────────────────────────────────┐
│  Header (Timer, Run Tests, etc.)                │
├──────┬────────────────────────────┬─────────────┤
│ File │  Editor                    │ AI Chat     │
│ Tree │  ─────────────────────────│             │
│      │  Terminal                  │             │
└──────┴────────────────────────────┴─────────────┘
```

- Left panel (15%): File tree
- Center panel (55%): Vertically split between Editor (60%) and Terminal (40%)
- Right panel (30%): AI Chat

Implemented using `react-resizable-panels` with `PanelGroup`, `Panel`, and `PanelResizeHandle`.

### Design System

The design system is Linear-inspired with a pitch-black aesthetic and purple accents. All configuration is in `tailwind.config.ts` and `app/globals.css`.

#### Color System

**Background Layers** (depth hierarchy):
```typescript
bg-background          // #000000 - Pure black (base layer)
bg-background-secondary // #0A0A0A - Slightly elevated (cards, panels)
bg-background-tertiary  // #121212 - More elevated (hover states, inputs)
bg-background-hover     // #1A1A1A - Interactive hover states
```

**Text Hierarchy** (readability):
```typescript
text-text-primary   // #FFFFFF - Headings, important text
text-text-secondary // #9CA3AF - Body text, descriptions
text-text-tertiary  // #6B7280 - Subtle text, labels
text-text-muted     // #4B5563 - Disabled, placeholder text
```

**Border Styles**:
```typescript
border-border           // #1A1A1A - Default borders
border-border-secondary // #2A2A2A - Emphasis borders
border-border-hover     // #3A3A3A - Interactive borders
```

**Primary (Purple Accent)**:
```typescript
bg-primary              // #5E6AD2 - Primary actions, CTAs
bg-primary-hover        // #6B77E1 - Hover state
bg-primary-active       // #4E5AC1 - Active/pressed state
text-primary            // Use for links, icons, accents
```

**Status Colors** (semantic):
```typescript
// Success (green)
bg-success / text-success       // #10B981
bg-success-light / text-success // #34D399
bg-success-dark                 // #059669

// Warning (amber)
bg-warning / text-warning       // #F59E0B

// Error (red)
bg-error / text-error           // #EF4444

// Info (blue)
bg-info / text-info             // #3B82F6
```

**When to use which color**:
- **Primary buttons**: `bg-primary text-white`
- **Secondary buttons**: `bg-background-tertiary border border-border`
- **Destructive actions**: `bg-error text-white`
- **Cards/containers**: `bg-background-secondary border border-border`
- **Status badges**: Use `/10` opacity background with full opacity text (e.g., `bg-success/10 text-success`)

#### Typography

**Font Families**:
```typescript
font-sans  // Geist Sans, Inter, system-ui (UI text)
font-mono  // Geist Mono, Menlo, Monaco (code, monospace data)
```

**Size Scale** (use semantic sizes):
```typescript
text-xs    // 12px - Labels, badges, metadata
text-sm    // 14px - Body text, buttons
text-base  // 16px - Default body
text-lg    // 18px - Subheadings
text-xl    // 20px - Section headers
text-2xl   // 24px - Page titles
text-3xl   // 30px - Large headings
text-4xl   // 36px - Hero headings
text-5xl   // 48px - Extra large hero
```

**Font Weights**:
```typescript
font-medium   // 500 - Emphasis, button text
font-semibold // 600 - Headings, labels
font-bold     // 700 - Strong emphasis
```

#### Component Variant System

Components use `class-variance-authority` (CVA) for type-safe variants:

```typescript
// Button variants (components/ui/button.tsx)
<Button variant="primary" size="md">      // Default CTA
<Button variant="secondary" size="sm">    // Secondary action
<Button variant="ghost">                  // Minimal action
<Button variant="outline">                // Outlined style
<Button variant="danger">                 // Destructive action
<Button variant="link">                   // Text link style

// Badge variants (components/ui/badge.tsx)
<Badge variant="default">   // Neutral
<Badge variant="primary">   // Purple accent
<Badge variant="success">   // Green status
<Badge variant="warning">   // Amber status
<Badge variant="error">     // Red status
<Badge variant="info">      // Blue informational
```

#### Spacing & Layout

**Consistent Spacing**:
```typescript
gap-2  // 8px  - Tight spacing (icons + text)
gap-3  // 12px - Related elements
gap-4  // 16px - Default spacing
gap-6  // 24px - Section spacing
gap-8  // 32px - Large section spacing
gap-12 // 48px - Major section breaks

p-3    // 12px - Compact padding
p-4    // 16px - Default padding
p-6    // 24px - Card/panel padding
```

**Container Widths**:
```typescript
max-w-3xl  // 768px - Prose, forms
max-w-5xl  // 1024px - Dashboard content
max-w-6xl  // 1152px - Landing pages
max-w-7xl  // 1280px - Full width sections
```

#### Animations

**Available Animations** (`tailwind.config.ts`):
```typescript
animate-fade-in       // Subtle fade in (0.2s)
animate-slide-up      // Slide up + fade (0.3s)
animate-slide-down    // Slide down + fade
animate-scale-in      // Scale up + fade
animate-pulse-subtle  // Gentle pulsing (2s loop)
animate-shimmer       // Loading shimmer effect
```

**Usage**:
```typescript
// Stagger animations on landing page
<div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
```

**Custom Utilities** (`app/globals.css`):
```typescript
.gradient-text         // Purple gradient text
.gradient-text-success // Green gradient text
.glass                 // Frosted glass effect
.border-glow           // Subtle purple glow on hover
```

#### Accessibility Features

**Built-in**:
- Focus rings: `focus-visible:ring-2 focus-visible:ring-primary/60`
- Reduced motion support: Respects `prefers-reduced-motion`
- Selection color: Purple tint (`rgba(94, 106, 210, 0.3)`)
- Scrollbar theming: Matches dark theme

**Component Patterns**:
```typescript
// Always include focus states
className="... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"

// Disabled states
disabled:pointer-events-none disabled:opacity-50
```

#### Common Patterns

**Hover States**:
```typescript
// Cards that elevate on hover
hover:border-primary/40 hover:shadow-glow transition-all

// Buttons with smooth transitions
transition-all hover:bg-primary-hover active:bg-primary-active
```

**Borders**:
```typescript
// Subtle card borders
border border-border bg-background-secondary

// Emphasized borders
border border-border-secondary

// Glowing interactive borders
border border-primary/20 hover:border-primary/40
```

**Glass/Frosted Panels**:
```typescript
bg-background/95 backdrop-blur-lg  // Navigation, modals
```

**Status Indicators**:
```typescript
// Use icons + color for clarity
<CheckCircle2 className="h-4 w-4 text-success" />
<XCircle className="h-4 w-4 text-error" />
<AlertCircle className="h-4 w-4 text-warning" />
```

#### Path Alias

```typescript
@/*  // Maps to project root (configured in tsconfig.json)

// Examples:
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
```

#### Important Rules

1. **Never use hardcoded colors** - Always use Tailwind tokens
2. **Maintain depth hierarchy** - Background layers create visual depth
3. **Use purple sparingly** - Primary color is for CTAs and accents only
4. **Test with reduced motion** - All animations should gracefully degrade
5. **Follow the CVA pattern** - Use variants for component consistency
6. **Include loading states** - All buttons support `loading` prop
7. **Respect text hierarchy** - primary > secondary > tertiary > muted

### UI Components

Custom component library in `components/ui/`:
- Button, Badge, Card, Dialog, Input, Textarea, Select, Checkbox
- Table, Progress, Tabs, Spinner, EmptyState
- Avatar, Label

All follow the pitch-black theme with purple accents.

### Layout Components

Located in `components/layout/`:
- **Header**: Global navigation
- **Sidebar**: Dashboard sidebar navigation
- **DashboardLayout**: Dashboard page wrapper
- **PageHeader**: Reusable page header with title/description
- **Container**: Content container with max-width

## Business Model (Pricing)

The platform operates on a **pay-per-assessment** model:
- **Pay-as-you-go**: $20/assessment
- **Medium Pack**: $15/assessment (50 credits for $750)
- **Enterprise**: $10/assessment (500+ credits, volume discounts)
- Free trial: 3-5 free assessments

This pricing is based on realistic COGS analysis documented in the `docs/` and various `PRICING_*.md` files.

## State Management

Currently uses React's built-in state management (`useState`, `useEffect`). No external state management library is used yet.

## Important Development Notes

1. **xterm.js SSR Issue**: Always import Terminal component dynamically:
   ```typescript
   const Terminal = dynamic(
     () => import("@/components/interview/Terminal").then((mod) => mod.Terminal),
     { ssr: false }
   );
   ```

2. **CodeMirror Theme**: The custom theme in `CodeEditor.tsx` must match the pitch-black background (`#000000`) to maintain visual consistency.

3. **Path References**: When referencing code locations in discussions, use the format `file_path:line_number` (e.g., `components/interview/Terminal.tsx:82`).

4. **Responsive Panels**: The FitAddon in Terminal requires delays and proper resize handling to avoid dimension calculation errors.

5. **Color Consistency**: Always use Tailwind color tokens (e.g., `text-text-primary`, `bg-background-secondary`) rather than hardcoded hex values to maintain theme consistency.

## Demo Mode vs. Production

The demo (`app/interview/demo/page.tsx`) simulates AI responses client-side with mock data. Production implementation would:
- Connect Terminal to actual Modal AI sandbox via WebSocket
- Route AI chat through backend API to Claude API
- Stream real-time file changes and test results
- Record session data for evaluation

## No API Routes Yet

The `app/api/` directory does not exist yet. Backend integration is pending.

## Documentation

Extensive business and technical documentation exists in:
- **Root-level markdown files**: Pricing strategy, COGS analysis, session recording architecture
- **`docs/` directory**: Additional documentation (12 files)

These documents contain detailed analysis of pricing models, cost structures, and technical architecture decisions.

## Linear Task Management (MCP)

**IMPORTANT**: Always use the Linear MCP tools for task management. Never skip this step.

### Workflow

1. **Before starting work**: Check for existing Linear issues related to the task
   ```
   mcp__linear-server__list_issues - Search for related issues
   ```

2. **When starting a new task**:
   - Ask the user: "Should I create a new Linear issue for this task, or is there an existing one?"
   - If new, use `mcp__linear-server__create_issue` to create the task
   - If existing, use `mcp__linear-server__update_issue` to update status

3. **During work**: Update issue status as you progress
   - Move to "In Progress" when starting
   - Add comments with `mcp__linear-server__create_comment` for significant updates

4. **After completing work**:
   - Update the issue status to "Done" or appropriate state
   - Add a summary comment of what was accomplished

### Available Linear MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__linear-server__list_teams` | List available teams |
| `mcp__linear-server__list_issues` | Search/filter issues |
| `mcp__linear-server__get_issue` | Get issue details |
| `mcp__linear-server__create_issue` | Create new issue |
| `mcp__linear-server__update_issue` | Update existing issue |
| `mcp__linear-server__create_comment` | Add comment to issue |
| `mcp__linear-server__list_issue_statuses` | Get available statuses |
| `mcp__linear-server__list_issue_labels` | Get available labels |
| `mcp__linear-server__list_projects` | List projects |
| `mcp__linear-server__list_cycles` | List sprints/cycles |

### Issue Creation Template

When creating issues, include:
- **Title**: Clear, actionable description
- **Description**: Context, acceptance criteria, technical notes
- **Labels**: Appropriate labels (bug, feature, improvement, etc.)
- **Project**: Assign to relevant project if applicable

### Example Workflow

```
User: "Help me implement user authentication"

Claude:
1. First, let me check if there's an existing issue for this...
   [Uses mcp__linear-server__list_issues with query="authentication"]

2. No existing issue found. Should I create a new Linear issue to track this work?

User: "Yes, create one"

Claude:
   [Uses mcp__linear-server__create_issue with title, description, team]
   Created issue AUTH-123: "Implement user authentication"

3. [Updates issue to "In Progress" as work begins]
4. [Adds comments for significant milestones]
5. [Updates to "Done" when complete]
```

### Always Ask

Before starting any significant work, always ask:
> "Is there an existing Linear issue for this task, or should I create a new one?"
