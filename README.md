# InterviewLM - AI-Powered Interview Platform

Modern talent hiring platform with AI-powered coding interviews, real-time collaboration, and comprehensive analytics.

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Authentication**: Auth.js (NextAuth v5) with OAuth & Credentials
- **Database**: PostgreSQL with Prisma ORM
- **UI Components**: Custom component library with Radix UI primitives
- **Code Editor**: CodeMirror 6
- **Terminal**: xterm.js
- **Styling**: Tailwind CSS with custom design system

## Features

- 🔐 **Authentication**: Email/password, Google OAuth, GitHub OAuth
- 👥 **Multi-tenancy**: Organizations and team management
- 📊 **Analytics Dashboard**: Comprehensive hiring analytics
- 💼 **Assessment Creation**: Flexible interview configuration
- 🧑‍💻 **Live Coding**: Real-time code editor with multiple languages
- 🖥️ **Terminal Access**: Integrated terminal for candidates
- 🤖 **AI Chat**: AI-powered interview assistance
- 📝 **Problem Seeds**: Reusable coding problem library
- 👤 **Candidate Management**: Track and evaluate candidates
- ⚙️ **Settings**: Comprehensive org and user settings

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 16+ (or Docker)
- Git

### 1. Clone and Install

```bash
git clone https://github.com/your-org/interviewlm-cs.git
cd interviewlm-cs
npm install
```

### 2. Set Up Database

**Option A: Docker (Recommended)**

```bash
docker run --name interviewlm-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=interviewlm \
  -p 5432:5432 \
  -d postgres:16
```

**Option B: Local PostgreSQL**

Install PostgreSQL and create a database named `interviewlm`.

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/interviewlm"
NEXTAUTH_SECRET="your-secret-here"  # Generate: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Run Database Migrations

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### 5. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Docker Setup (Recommended)

The easiest way to run InterviewLM is with Docker:

```bash
# Start full development environment (Next.js + PostgreSQL)
npm run docker:dev

# View logs
npm run docker:dev:logs

# Stop environment
npm run docker:dev:stop
```

Access:
- **App**: http://localhost:3000
- **Database**: localhost:5432

For detailed Docker instructions, see [Docker Guide](docs/DOCKER.md).

### Run Integration Tests with Docker

```bash
# Run all integration tests against real database
npm run docker:test

# Watch mode for development
npm run docker:test:watch
```

## Development

### Project Structure

```
interviewlm-cs/
├── app/                      # Next.js app directory
│   ├── api/                  # API routes
│   │   └── auth/            # Authentication endpoints
│   ├── auth/                # Auth pages (signin, signup)
│   ├── dashboard/           # Main dashboard
│   ├── assessments/         # Assessment management
│   ├── candidates/          # Candidate tracking
│   ├── analytics/           # Analytics dashboard
│   ├── problems/            # Problem seeds
│   ├── settings/            # Settings pages
│   └── interview/           # Live interview interface
├── components/              # React components
│   ├── ui/                  # Base UI components
│   ├── layout/              # Layout components
│   ├── assessment/          # Assessment-specific
│   ├── analytics/           # Analytics components
│   └── interview/           # Interview components
├── lib/                     # Utility libraries
│   ├── prisma.ts           # Prisma client
│   ├── utils.ts            # Helper functions
│   └── *.ts                # Domain logic
├── prisma/                  # Database schema
│   └── schema.prisma       # Prisma schema
├── types/                   # TypeScript types
├── docs/                    # Documentation
└── public/                  # Static assets
```

### Key Commands

```bash
# Development
npm run dev           # Start dev server
npm run build         # Build for production
npm run start         # Start production server
npm run lint          # Run ESLint

# Database
npx prisma studio     # Open database GUI
npx prisma generate   # Generate Prisma client
npx prisma db push    # Push schema changes
npx prisma migrate dev # Create migration
npx prisma format     # Format schema file

# Testing (coming soon)
npm test              # Run tests
npm run test:watch    # Watch mode
```

## Authentication Setup

### Local Development (Email/Password)

No additional setup needed - works out of the box with credentials provider.

### OAuth Providers

#### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set callback URL: `http://localhost:3000/api/auth/callback/github`
4. Add credentials to `.env`:

```env
GITHUB_CLIENT_ID="your_client_id"
GITHUB_CLIENT_SECRET="your_client_secret"
```

#### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth client ID
3. Set authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Add credentials to `.env`:

```env
GOOGLE_CLIENT_ID="your_client_id"
GOOGLE_CLIENT_SECRET="your_client_secret"
```

## Database Schema

The application uses the following main models:

- **User**: User accounts with authentication
- **Organization**: Multi-tenant organizations
- **OrganizationMember**: Team membership and roles
- **Assessment**: Interview configurations
- **AssessmentQuestion**: Questions within assessments
- **ProblemSeed**: Reusable coding problems
- **Candidate**: Interview candidates and results

See `prisma/schema.prisma` for the complete schema.

## Deployment

### AWS Deployment (Using Credits)

See [docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md#aws-setup-using-credits) for detailed AWS setup.

**Quick Deploy to AWS App Runner:**

1. Set up AWS RDS PostgreSQL
2. Configure environment variables
3. Deploy with AWS App Runner or Amplify

### GCP Deployment (Using Credits)

See [docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md#gcp-setup-using-credits) for detailed GCP setup.

**Quick Deploy to Cloud Run:**

```bash
gcloud run deploy interviewlm \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### Environment Variables for Production

```env
DATABASE_URL="postgresql://..."         # Production database
NEXTAUTH_SECRET="..."                   # New secret for prod
NEXTAUTH_URL="https://yourdomain.com"   # Your domain
GITHUB_CLIENT_ID="..."                  # Production OAuth
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

## Features Roadmap

### Current Features (v1.0)
- ✅ User authentication (credentials, OAuth)
- ✅ Organization management
- ✅ Assessment creation wizard
- ✅ Live coding interface
- ✅ Terminal integration
- ✅ AI chat support
- ✅ Analytics dashboard
- ✅ Candidate tracking
- ✅ Problem seed library

### Upcoming Features
- [ ] Session recording and playback
- [ ] Advanced analytics and insights
- [ ] Email notifications
- [ ] Slack integration
- [ ] API webhooks
- [ ] Custom branding
- [ ] SSO (SAML, OIDC)
- [ ] Advanced scoring algorithms
- [ ] Video interview support
- [ ] Mobile app

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use Prettier for code formatting
- Write meaningful commit messages
- Add tests for new features
- Update documentation

## Architecture Decisions

### Why Next.js Full-Stack?

- **Single codebase**: Frontend and backend in TypeScript
- **Better DX**: Hot reload, TypeScript throughout
- **Easy deployment**: Vercel, AWS Amplify, Cloud Run support
- **Auth integration**: Auth.js works seamlessly
- **AWS/GCP credits**: Can deploy entirely on AWS/GCP infrastructure

### Why Auth.js over Others?

- **Provider flexibility**: Easy to add OAuth providers
- **Session management**: Built-in JWT and database sessions
- **Next.js integration**: First-class Next.js support
- **Security**: Battle-tested authentication
- **Free and open source**: No vendor lock-in

### Why Prisma?

- **Type safety**: Auto-generated TypeScript types
- **Great DX**: Intuitive schema and query API
- **Migrations**: Built-in migration system
- **Studio**: Visual database browser
- **Multi-database**: Easy to switch databases

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
npx prisma db pull

# Check connection string format
# postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

### Authentication Not Working

1. Check `NEXTAUTH_SECRET` is set
2. Verify `NEXTAUTH_URL` matches your domain
3. Check OAuth callback URLs match
4. Clear browser cookies and try again

### Build Errors

```bash
# Clear cache and reinstall
rm -rf .next node_modules
npm install
npm run build
```

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Auth.js Documentation](https://authjs.dev/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Backend Setup Guide](docs/BACKEND_SETUP.md)

## License

MIT License - see LICENSE file for details

## Support

For support, email support@interviewlm.com or open an issue on GitHub.

---

Built with ❤️ by the InterviewLM team
