import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Prevent accidental seeding in production
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED_IN_PRODUCTION) {
    console.error("❌ Seed script cannot run in production without ALLOW_SEED_IN_PRODUCTION=true");
    process.exit(1);
  }

  console.log("🌱 Starting database seed...");

  // Use environment variable for seed password or generate a random one
  const seedPassword = process.env.SEED_PASSWORD || `dev-${Math.random().toString(36).slice(2)}`;
  const hashedPassword = await bcrypt.hash(seedPassword, 10);

  const user = await prisma.user.upsert({
    where: { email: "test@interviewlm.com" },
    update: {},
    create: {
      email: "test@interviewlm.com",
      name: "Test User",
      password: hashedPassword,
      role: "USER",
      emailVerified: new Date(),
    },
  });

  console.log("✅ Created test user:", user.email);

  // Create a test organization
  const organization = await prisma.organization.upsert({
    where: { slug: "test-org" },
    update: {},
    create: {
      name: "Test Organization",
      slug: "test-org",
      description: "Test organization for development",
      plan: "FREE",
    },
  });

  console.log("✅ Created test organization:", organization.name);

  // Link user to organization
  const orgMember = await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
      joinedAt: new Date(),
    },
  });

  console.log("✅ Linked user to organization as:", orgMember.role);

  // Create an admin user
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@interviewlm.com" },
    update: {},
    create: {
      email: "admin@interviewlm.com",
      name: "Admin User",
      password: hashedPassword,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  console.log("✅ Created admin user:", adminUser.email);

  // Link admin to organization
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: adminUser.id,
      role: "ADMIN",
      joinedAt: new Date(),
    },
  });

  console.log("✅ Linked admin user to organization");

  // Seed problem seeds (curated question bank)
  console.log("\n📚 Seeding problem seeds...");

  const { ALL_PROBLEM_SEEDS } = await import("./seeds/problem-seeds");

  let seedsCreated = 0;
  let seedsSkipped = 0;

  for (const seedData of ALL_PROBLEM_SEEDS) {
    try {
      const existing = await prisma.problemSeed.findFirst({
        where: {
          title: seedData.title,
          organizationId: organization.id,
        },
      });

      if (existing) {
        seedsSkipped++;
        continue;
      }

      await prisma.problemSeed.create({
        data: {
          organizationId: organization.id,
          title: seedData.title,
          description: seedData.description,
          difficulty: seedData.difficulty,
          category: seedData.category,
          tags: seedData.tags,
          starterCode: seedData.starterCode || null,
          testCode: seedData.testCode || null,
          language: seedData.language,
        },
      });

      seedsCreated++;
    } catch (error) {
      console.error(`  ❌ Failed to create seed "${seedData.title}":`, error);
    }
  }

  console.log(`✅ Created ${seedsCreated} problem seeds (${seedsSkipped} already existed)`);

  // Seed default backend seeds (10 seeds: 5 seniorities × 2 assessment types)
  console.log("\n🎯 Seeding default backend seeds (Assessment Type system)...");

  const { BACKEND_DEFAULT_SEEDS } = await import("./seeds/backend-default-seeds");

  let defaultSeedsCreated = 0;
  let defaultSeedsSkipped = 0;

  for (const seedData of BACKEND_DEFAULT_SEEDS) {
    try {
      // Check if a default seed already exists for this combination
      const existing = await prisma.problemSeed.findFirst({
        where: {
          targetRole: seedData.targetRole,
          targetSeniority: seedData.targetSeniority,
          assessmentType: seedData.assessmentType,
          isDefaultSeed: true,
        },
      });

      if (existing) {
        defaultSeedsSkipped++;
        continue;
      }

      await prisma.problemSeed.create({
        data: {
          organizationId: organization.id,
          title: seedData.title,
          description: seedData.description,
          difficulty: seedData.difficulty,
          category: seedData.category,
          tags: seedData.tags,
          topics: seedData.topics,
          language: seedData.language,
          estimatedTime: seedData.estimatedTime,
          seedType: seedData.seedType,
          status: seedData.status,
          isSystemSeed: seedData.isSystemSeed,

          // Assessment type targeting fields
          targetRole: seedData.targetRole,
          targetSeniority: seedData.targetSeniority,
          assessmentType: seedData.assessmentType,
          isDefaultSeed: seedData.isDefaultSeed,

          // Incremental assessment fields (cast to Prisma InputJsonValue)
          requiredTech: seedData.requiredTech as unknown as object,
          baseProblem: seedData.baseProblem as unknown as object,
          progressionHints: seedData.progressionHints as unknown as object,
          seniorityExpectations: seedData.seniorityExpectations as unknown as object,

          // System Design specific fields
          designDocTemplate: seedData.designDocTemplate ? (seedData.designDocTemplate as unknown as object) : undefined,
          architectureHints: seedData.architectureHints ? (seedData.architectureHints as unknown as object) : undefined,
          implementationScope: seedData.implementationScope || null,

          // Evaluation rubric
          evaluationRubric: seedData.evaluationRubric as unknown as object,
        },
      });

      defaultSeedsCreated++;
    } catch (error) {
      console.error(`  ❌ Failed to create default seed "${seedData.title}":`, error);
    }
  }

  console.log(`✅ Created ${defaultSeedsCreated} default backend seeds (${defaultSeedsSkipped} already existed)`);

  // Seed complexity profiles (Dynamic Question Generation System)
  console.log("\n🎲 Seeding complexity profiles (Dynamic Question Generation)...");

  const { ALL_COMPLEXITY_PROFILES } = await import("./seeds/complexity-profiles");

  let profilesCreated = 0;
  let profilesSkipped = 0;

  for (const profile of ALL_COMPLEXITY_PROFILES) {
    try {
      // Check if a default profile already exists for this combination
      const existing = await prisma.complexityProfile.findFirst({
        where: {
          role: profile.role,
          seniority: profile.seniority,
          assessmentType: profile.assessmentType,
          isDefault: true,
          organizationId: null, // System default
        },
      });

      if (existing) {
        profilesSkipped++;
        continue;
      }

      await prisma.complexityProfile.create({
        data: {
          role: profile.role,
          seniority: profile.seniority,
          assessmentType: profile.assessmentType,
          entityCountMin: profile.entityCountMin,
          entityCountMax: profile.entityCountMax,
          integrationPoints: profile.integrationPoints,
          businessLogic: profile.businessLogic,
          ambiguityLevel: profile.ambiguityLevel,
          timeMinutes: profile.timeMinutes,
          requiredSkills: profile.requiredSkills,
          optionalSkillPool: profile.optionalSkillPool,
          avoidSkills: profile.avoidSkills,
          pickOptionalCount: profile.pickOptionalCount,
          domainPool: profile.domainPool,
          constraints: profile.constraints,
          isDefault: profile.isDefault,
          organizationId: null, // System default
        },
      });

      profilesCreated++;
    } catch (error) {
      console.error(`  ❌ Failed to create profile "${profile.role}/${profile.seniority}/${profile.assessmentType}":`, error);
    }
  }

  console.log(`✅ Created ${profilesCreated} complexity profiles (${profilesSkipped} already existed)`);

  // Seed technologies
  console.log("\n🔧 Seeding technologies...");

  const technologies = [
    // Languages
    { slug: "python", name: "Python", category: "language", icon: "FileCode2", description: "General-purpose programming language", color: "#3776AB", pairedWithIds: ["fastapi", "django", "flask", "pytest", "sqlalchemy"] },
    { slug: "javascript", name: "JavaScript", category: "language", icon: "FileCode2", description: "Dynamic programming language for web", color: "#F7DF1E", pairedWithIds: ["react", "nodejs", "express", "jest"] },
    { slug: "typescript", name: "TypeScript", category: "language", icon: "FileCode2", description: "Typed superset of JavaScript", color: "#3178C6", pairedWithIds: ["react", "nodejs", "express", "jest", "nextjs"] },
    { slug: "go", name: "Go", category: "language", icon: "FileCode2", description: "Statically typed compiled language", color: "#00ADD8", pairedWithIds: ["gin", "postgresql", "redis"] },
    { slug: "java", name: "Java", category: "language", icon: "FileCode2", description: "Object-oriented programming language", color: "#007396", pairedWithIds: ["spring", "junit", "maven"] },
    { slug: "csharp", name: "C#", category: "language", icon: "FileCode2", description: "Modern, object-oriented language", color: "#239120", pairedWithIds: ["dotnet", "entityframework", "nunit"] },
    { slug: "ruby", name: "Ruby", category: "language", icon: "FileCode2", description: "Dynamic, open source language", color: "#CC342D", pairedWithIds: ["rails", "rspec"] },
    { slug: "rust", name: "Rust", category: "language", icon: "FileCode2", description: "Systems programming language", color: "#CE422B", pairedWithIds: ["actix", "tokio"] },
    // Frameworks
    { slug: "react", name: "React", category: "framework", icon: "Atom", description: "JavaScript library for building UIs", color: "#61DAFB", pairedWithIds: ["typescript", "javascript", "jest", "nextjs"] },
    { slug: "nextjs", name: "Next.js", category: "framework", icon: "Triangle", description: "React framework for production", color: "#000000", pairedWithIds: ["react", "typescript", "vercel"] },
    { slug: "nodejs", name: "Node.js", category: "framework", icon: "Hexagon", description: "JavaScript runtime", color: "#339933", pairedWithIds: ["express", "javascript", "typescript"] },
    { slug: "express", name: "Express", category: "framework", icon: "Server", description: "Fast Node.js web framework", color: "#000000", pairedWithIds: ["nodejs", "mongodb", "postgresql"] },
    { slug: "django", name: "Django", category: "framework", icon: "Database", description: "Python web framework", color: "#092E20", pairedWithIds: ["python", "postgresql", "redis"] },
    { slug: "fastapi", name: "FastAPI", category: "framework", icon: "Zap", description: "Modern Python web framework", color: "#009688", pairedWithIds: ["python", "postgresql", "redis"] },
    { slug: "flask", name: "Flask", category: "framework", icon: "Beaker", description: "Python micro web framework", color: "#000000", pairedWithIds: ["python", "postgresql", "mongodb"] },
    { slug: "spring", name: "Spring", category: "framework", icon: "Leaf", description: "Java enterprise framework", color: "#6DB33F", pairedWithIds: ["java", "postgresql", "mysql"] },
    { slug: "rails", name: "Rails", category: "framework", icon: "Train", description: "Ruby web framework", color: "#CC0000", pairedWithIds: ["ruby", "postgresql", "redis"] },
    { slug: "gin", name: "Gin", category: "framework", icon: "Wind", description: "Go web framework", color: "#00ADD8", pairedWithIds: ["go", "postgresql", "redis"] },
    { slug: "vue", name: "Vue.js", category: "framework", icon: "Triangle", description: "Progressive JavaScript framework", color: "#4FC08D", pairedWithIds: ["javascript", "typescript", "nuxt"] },
    { slug: "angular", name: "Angular", category: "framework", icon: "Shield", description: "TypeScript-based framework", color: "#DD0031", pairedWithIds: ["typescript", "rxjs"] },
    // Databases
    { slug: "postgresql", name: "PostgreSQL", category: "database", icon: "Database", description: "Advanced open source database", color: "#336791", pairedWithIds: ["python", "nodejs", "go"] },
    { slug: "mongodb", name: "MongoDB", category: "database", icon: "Database", description: "Document-oriented database", color: "#47A248", pairedWithIds: ["nodejs", "python", "express"] },
    { slug: "mysql", name: "MySQL", category: "database", icon: "Database", description: "Popular relational database", color: "#4479A1", pairedWithIds: ["python", "java", "php"] },
    { slug: "redis", name: "Redis", category: "database", icon: "Database", description: "In-memory data store", color: "#DC382D", pairedWithIds: ["nodejs", "python", "go"] },
    { slug: "sqlite", name: "SQLite", category: "database", icon: "Database", description: "Lightweight embedded database", color: "#003B57", pairedWithIds: ["python", "nodejs", "mobile"] },
    // Testing
    { slug: "jest", name: "Jest", category: "testing", icon: "TestTube", description: "JavaScript testing framework", color: "#C21325", pairedWithIds: ["javascript", "typescript", "react"] },
    { slug: "pytest", name: "Pytest", category: "testing", icon: "TestTube", description: "Python testing framework", color: "#0A9EDC", pairedWithIds: ["python", "django", "fastapi"] },
    { slug: "junit", name: "JUnit", category: "testing", icon: "TestTube", description: "Java testing framework", color: "#25A162", pairedWithIds: ["java", "spring"] },
    { slug: "rspec", name: "RSpec", category: "testing", icon: "TestTube", description: "Ruby testing framework", color: "#CC342D", pairedWithIds: ["ruby", "rails"] },
    { slug: "cypress", name: "Cypress", category: "testing", icon: "TestTube", description: "E2E testing framework", color: "#17202C", pairedWithIds: ["javascript", "react", "vue"] },
    // Tools
    { slug: "docker", name: "Docker", category: "tool", icon: "Container", description: "Container platform", color: "#2496ED", pairedWithIds: ["kubernetes", "nodejs", "python"] },
    { slug: "kubernetes", name: "Kubernetes", category: "tool", icon: "Cloud", description: "Container orchestration", color: "#326CE5", pairedWithIds: ["docker", "aws", "gcp"] },
    { slug: "git", name: "Git", category: "tool", icon: "GitBranch", description: "Version control system", color: "#F05032", pairedWithIds: ["github", "gitlab"] },
    { slug: "aws", name: "AWS", category: "tool", icon: "Cloud", description: "Amazon cloud platform", color: "#FF9900", pairedWithIds: ["docker", "kubernetes", "terraform"] },
    { slug: "graphql", name: "GraphQL", category: "tool", icon: "Share2", description: "API query language", color: "#E10098", pairedWithIds: ["nodejs", "react", "apollo"] },
  ];

  let techCreated = 0;
  let techSkipped = 0;

  for (const tech of technologies) {
    const existing = await prisma.technology.findUnique({
      where: { slug: tech.slug },
    });

    if (existing) {
      techSkipped++;
      continue;
    }

    await prisma.technology.create({
      data: {
        slug: tech.slug,
        name: tech.name,
        category: tech.category,
        icon: tech.icon,
        description: tech.description,
        color: tech.color,
        pairedWithIds: tech.pairedWithIds,
        isActive: true,
      },
    });
    techCreated++;
  }

  console.log(`✅ Created ${techCreated} technologies (${techSkipped} already existed)`);

  console.log("\n🎉 Seed completed successfully!");
  console.log("\nTest credentials:");
  console.log("  Email: test@interviewlm.com");
  console.log(`  Password: ${seedPassword}`);
  console.log("\nAdmin credentials:");
  console.log("  Email: admin@interviewlm.com");
  console.log(`  Password: ${seedPassword}`);
  console.log("\n💡 Tip: Set SEED_PASSWORD environment variable for consistent credentials");
  console.log(`\n📊 Database seeded with ${seedsCreated} problem seeds across 5 categories:`);
  console.log("  • Backend (8 seeds)");
  console.log("  • Frontend (7 seeds)");
  console.log("  • Algorithms (5 seeds)");
  console.log("  • Full-Stack (4 seeds)");
  console.log("  • Specialized (6 seeds)");
  console.log(`\n🎯 Default Backend Seeds (Assessment Type System): ${defaultSeedsCreated}`);
  console.log("  • Real World Problems: Junior, Mid, Senior, Staff, Principal");
  console.log("  • System Design: Junior, Mid, Senior, Staff, Principal");
  console.log(`\n🎲 Complexity Profiles (Dynamic Question Generation): ${profilesCreated}`);
  console.log("  • Real World: 5 seniority levels");
  console.log("  • System Design: 5 seniority levels");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
