# Copilot Instructions for InterviewLM

## Project Overview

InterviewLM is an AI-powered interview and talent hiring platform that leverages advanced AI to recreate authentic work-like interview scenarios and provide accurate skill measurements. This is a Next.js-based web application with a modern, sleek interface.

## Tech Stack

- **Framework**: Next.js 15.0.0 (App Router)
- **UI Library**: React 19.0.0
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 3.4.1
- **Animations**: Framer Motion 11.0.0
- **Fonts**: Google Fonts (Geist, Geist Mono)
- **Linting**: ESLint 8 with Next.js config

## Project Structure

```
interviewlm-cs/
├── app/                  # Next.js App Router directory
│   ├── globals.css      # Global styles and Tailwind directives
│   ├── layout.tsx       # Root layout with metadata
│   └── page.tsx         # Home page component
├── .github/             # GitHub configuration
├── public/              # Static assets (if needed)
└── [config files]       # Next.js, TypeScript, Tailwind configs
```

## Development Commands

- **Install dependencies**: `npm install`
- **Run development server**: `npm run dev`
- **Build for production**: `npm run build`
- **Start production server**: `npm start`
- **Lint code**: `npm run lint`

## Coding Conventions

### TypeScript
- Use strict TypeScript settings
- Prefer interfaces over types for object shapes
- Use explicit return types for functions when complexity warrants it
- Avoid `any` types; use proper typing or `unknown` when necessary

### React & Next.js
- Use functional components with hooks
- Prefer `'use client'` directive for client-side interactive components
- Follow App Router conventions (layout.tsx, page.tsx, etc.)
- Use Next.js `Metadata` API for SEO in layout files
- Organize client components in the `app/` directory

### Styling
- Use Tailwind CSS utility classes
- Follow mobile-first responsive design principles
- Maintain consistent spacing using Tailwind's spacing scale
- Use semantic color classes (e.g., `bg-zinc-900`, `text-gray-400`)
- Keep custom CSS minimal; prefer Tailwind utilities

### Animation
- Use Framer Motion for animations
- Define animation variants separately for reusability
- Use appropriate easing functions for smooth transitions
- Follow the established animation patterns (stagger, fade-in, etc.)

### Code Style
- Use single quotes for strings
- Use 2-space indentation
- Add semicolons at the end of statements
- Use arrow functions for component definitions
- Group imports: external libraries first, then local imports

## Boundaries

### Do Not Modify
- `package-lock.json` (unless updating dependencies)
- `.gitignore` (unless adding new ignore patterns)
- Build output directories (`.next/`, `node_modules/`)

### Security
- Never commit API keys, secrets, or credentials
- Validate user inputs on both client and server
- Use environment variables for configuration
- Follow security best practices for authentication when implemented

## When Making Changes

### Adding New Features
1. Create components in appropriate directories
2. Use TypeScript for type safety
3. Follow existing animation and styling patterns
4. Ensure responsive design across all viewports
5. Test interactive elements thoroughly

### Bug Fixes
1. Understand the root cause before making changes
2. Fix the issue with minimal code changes
3. Ensure the fix doesn't break existing functionality
4. Add comments for complex logic if needed

### Refactoring
1. Maintain existing functionality
2. Improve code readability and maintainability
3. Keep changes focused and incremental
4. Update related documentation if needed

### Testing
- Test on multiple screen sizes (mobile, tablet, desktop)
- Verify animations work smoothly
- Check accessibility (keyboard navigation, screen readers)
- Validate form interactions and state management

## Best Practices

1. **Component Design**: Keep components focused and reusable
2. **Performance**: Optimize images, minimize bundle size, use lazy loading when appropriate
3. **Accessibility**: Use semantic HTML, ARIA labels, and keyboard navigation
4. **SEO**: Maintain proper metadata, semantic structure, and alt text
5. **Code Quality**: Write clean, readable code with clear variable names
6. **Git Commits**: Write clear, descriptive commit messages

## Common Tasks

### Adding a New Page
1. Create `page.tsx` in the appropriate `app/` subdirectory
2. Add metadata in `layout.tsx` or use route-specific metadata
3. Follow existing styling and animation patterns
4. Ensure proper TypeScript types

### Updating Styles
1. Use Tailwind utility classes first
2. Add custom CSS to `globals.css` only if necessary
3. Maintain consistency with existing design
4. Test responsive behavior

### Adding Dependencies
1. Use `npm install <package>` to add new packages
2. Verify package compatibility with React 19 and Next.js 15
3. Update this instructions file if the dependency significantly changes the stack

## Notes

- This is a landing page for an upcoming product launch
- Focus on smooth, professional animations and interactions
- The design emphasizes a modern, minimalist aesthetic with dark theme
- Email signup is currently a mock implementation (no backend integration yet)
