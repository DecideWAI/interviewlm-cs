/**
 * Production Seed Script
 *
 * Seeds SYSTEM-LEVEL data that is shared across ALL organizations:
 * - Configuration (security, model, sandbox, role, seniority, tier configs)
 * - Technologies (languages, frameworks, databases, etc.)
 * - Pricing Plans (credit packs)
 * - Assessment Add-ons (video recording, live proctoring)
 * - Default Backend Seeds (10 seeds: 5 seniorities × 2 assessment types)
 * - Complexity Profiles (for dynamic question generation)
 *
 * This script is SAFE to run multiple times (idempotent).
 * All system seeds have organizationId: null and are immutable.
 *
 * Usage:
 *   ALLOW_SEED_IN_PRODUCTION=true npx tsx prisma/production-seed.ts
 */

import { PrismaClient } from "@prisma/client";
import { seedAllConfigs } from "./seeds/config-seeds";

const prisma = new PrismaClient();

async function main() {
  // Safety check for production
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED_IN_PRODUCTION) {
    console.error("❌ Production seed requires ALLOW_SEED_IN_PRODUCTION=true");
    process.exit(1);
  }

  console.log("🌱 Starting PRODUCTION seed (system-level data only)...\n");

  // =========================================================================
  // 1. Seed Configuration Data
  // =========================================================================
  console.log("⚙️  Seeding configuration data...");
  await seedAllConfigs();
  console.log("✅ Configuration data seeded\n");

  // =========================================================================
  // 2. Seed Technologies (System-wide)
  // =========================================================================
  console.log("🔧 Seeding technologies...");

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
    const existing = await prisma.technology.findFirst({
      where: {
        slug: tech.slug,
        organizationId: null, // System technology
      },
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
        isSystem: true,
        organizationId: null, // System-wide
      },
    });
    techCreated++;
  }

  console.log(`✅ Technologies: ${techCreated} created, ${techSkipped} already existed\n`);

  // =========================================================================
  // 3. Seed Pricing Plans
  // =========================================================================
  console.log("💳 Seeding pricing plans...");

  const pricingPlans = [
    {
      slug: "starter",
      name: "Starter Pack",
      description: "Perfect for trying out the platform",
      paddleProductId: process.env.PADDLE_PRODUCT_STARTER || "pri_starter_10",
      credits: 10,
      price: 250.00,
      pricePerCredit: 25.00,
      sortOrder: 1,
      isPopular: false,
      badge: null,
      features: [
        "10 base assessments",
        "AI-assisted coding environment",
        "Automated evaluation",
        "AI usage analytics",
        "30-day result access",
      ],
      planType: "ONE_TIME" as const,
    },
    {
      slug: "growth",
      name: "Growth Pack",
      description: "For growing engineering teams",
      paddleProductId: process.env.PADDLE_PRODUCT_GROWTH || "pri_growth_50",
      credits: 50,
      price: 1125.00,
      pricePerCredit: 22.50,
      sortOrder: 2,
      isPopular: false,
      badge: "10% Savings",
      features: [
        "50 base assessments",
        "All Starter features",
        "Priority support",
        "Team analytics dashboard",
        "Candidate comparison tools",
      ],
      planType: "ONE_TIME" as const,
    },
    {
      slug: "scale",
      name: "Scale Pack",
      description: "For high-volume technical hiring",
      paddleProductId: process.env.PADDLE_PRODUCT_SCALE || "pri_scale_200",
      credits: 200,
      price: 4200.00,
      pricePerCredit: 21.00,
      sortOrder: 3,
      isPopular: true,
      badge: "Most Popular",
      features: [
        "200 base assessments",
        "All Growth features",
        "Dedicated account manager",
        "API access",
        "Custom problem library",
        "Bulk candidate invites",
      ],
      planType: "ONE_TIME" as const,
    },
    {
      slug: "enterprise",
      name: "Enterprise Pack",
      description: "Enterprise-scale hiring with maximum value",
      paddleProductId: process.env.PADDLE_PRODUCT_ENTERPRISE || "pri_enterprise_500",
      credits: 500,
      price: 10000.00,
      pricePerCredit: 20.00,
      sortOrder: 4,
      isPopular: false,
      badge: "Best Value",
      features: [
        "500 base assessments",
        "All Scale features",
        "SSO/SAML authentication",
        "Custom integrations",
        "90-day result retention",
        "Custom SLA",
        "White-label options",
      ],
      planType: "ONE_TIME" as const,
    },
  ];

  let plansCreated = 0;
  let plansUpdated = 0;

  for (const plan of pricingPlans) {
    const existing = await prisma.pricingPlan.findUnique({
      where: { slug: plan.slug },
    });

    if (existing) {
      await prisma.pricingPlan.update({
        where: { slug: plan.slug },
        data: {
          paddleProductId: plan.paddleProductId,
          name: plan.name,
          description: plan.description,
          credits: plan.credits,
          price: plan.price,
          pricePerCredit: plan.pricePerCredit,
          sortOrder: plan.sortOrder,
          isPopular: plan.isPopular,
          badge: plan.badge,
          features: plan.features,
          planType: plan.planType,
          isActive: true,
        },
      });
      plansUpdated++;
    } else {
      await prisma.pricingPlan.create({
        data: {
          slug: plan.slug,
          paddleProductId: plan.paddleProductId,
          name: plan.name,
          description: plan.description,
          credits: plan.credits,
          price: plan.price,
          pricePerCredit: plan.pricePerCredit,
          sortOrder: plan.sortOrder,
          isPopular: plan.isPopular,
          badge: plan.badge,
          features: plan.features,
          planType: plan.planType,
          isActive: true,
        },
      });
      plansCreated++;
    }
  }

  console.log(`✅ Pricing plans: ${plansCreated} created, ${plansUpdated} updated\n`);

  // =========================================================================
  // 4. Seed Assessment Add-Ons
  // =========================================================================
  console.log("🎬 Seeding assessment add-ons...");

  const addons = [
    {
      slug: "video-recording",
      name: "Video Recording",
      description: "Full session recording with timeline playback and scrubbing",
      price: 10.00,
      icon: "Video",
      sortOrder: 1,
      features: [
        "Complete session video recording",
        "Timeline scrubbing and playback",
        "Code change visualization",
        "AI interaction replay",
        "Shareable with hiring team",
      ],
    },
    {
      slug: "live-proctoring",
      name: "Live Proctoring",
      description: "Real-time monitoring with anti-cheating measures",
      price: 15.00,
      icon: "Shield",
      sortOrder: 2,
      features: [
        "Webcam monitoring",
        "Screen activity tracking",
        "Browser lock mode",
        "Tab switch detection",
        "Copy-paste monitoring",
        "Identity verification",
      ],
    },
  ];

  let addonsCreated = 0;
  let addonsUpdated = 0;

  for (const addon of addons) {
    const existing = await prisma.assessmentAddOn.findUnique({
      where: { slug: addon.slug },
    });

    if (existing) {
      await prisma.assessmentAddOn.update({
        where: { slug: addon.slug },
        data: {
          name: addon.name,
          description: addon.description,
          price: addon.price,
          icon: addon.icon,
          sortOrder: addon.sortOrder,
          features: addon.features,
          isActive: true,
        },
      });
      addonsUpdated++;
    } else {
      await prisma.assessmentAddOn.create({
        data: {
          slug: addon.slug,
          name: addon.name,
          description: addon.description,
          price: addon.price,
          icon: addon.icon,
          sortOrder: addon.sortOrder,
          features: addon.features,
          isActive: true,
        },
      });
      addonsCreated++;
    }
  }

  console.log(`✅ Assessment add-ons: ${addonsCreated} created, ${addonsUpdated} updated\n`);

  // =========================================================================
  // 5. Seed Default Backend Seeds (System-wide, organizationId: null)
  // =========================================================================
  console.log("🎯 Seeding default backend seeds (system-wide)...");

  const { BACKEND_DEFAULT_SEEDS } = await import("./seeds/backend-default-seeds");

  let defaultSeedsCreated = 0;
  let defaultSeedsSkipped = 0;

  for (const seedData of BACKEND_DEFAULT_SEEDS) {
    try {
      // Check if a system default seed already exists for this combination
      const existing = await prisma.problemSeed.findFirst({
        where: {
          targetRole: seedData.targetRole,
          targetSeniority: seedData.targetSeniority,
          assessmentType: seedData.assessmentType,
          isDefaultSeed: true,
          isSystemSeed: true,
          organizationId: null, // System seed
        },
      });

      if (existing) {
        defaultSeedsSkipped++;
        continue;
      }

      await prisma.problemSeed.create({
        data: {
          organizationId: null, // SYSTEM SEED - shared across all orgs
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
          isSystemSeed: true, // Mark as system seed
          isDefaultSeed: true, // Mark as default for this combination

          // Assessment type targeting fields
          targetRole: seedData.targetRole,
          targetSeniority: seedData.targetSeniority,
          assessmentType: seedData.assessmentType,

          // Incremental assessment fields
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

  console.log(`✅ Default backend seeds: ${defaultSeedsCreated} created, ${defaultSeedsSkipped} already existed`);
  console.log("   • Real World: Junior, Mid, Senior, Staff, Principal");
  console.log("   • System Design: Junior, Mid, Senior, Staff, Principal\n");

  // =========================================================================
  // 6. Seed Complexity Profiles (System-wide)
  // =========================================================================
  console.log("🎲 Seeding complexity profiles (system-wide)...");

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

  console.log(`✅ Complexity profiles: ${profilesCreated} created, ${profilesSkipped} already existed`);
  console.log("   • Real World: 5 seniority levels");
  console.log("   • System Design: 5 seniority levels\n");

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("═".repeat(60));
  console.log("🎉 PRODUCTION SEED COMPLETED SUCCESSFULLY!");
  console.log("═".repeat(60));
  console.log("\nSeeded system-level data:");
  console.log("  • Configuration data (security, model, sandbox, role, seniority, tier)");
  console.log(`  • Technologies: ${techCreated} new, ${techSkipped} existing`);
  console.log(`  • Pricing plans: ${plansCreated} new, ${plansUpdated} updated`);
  console.log(`  • Assessment add-ons: ${addonsCreated} new, ${addonsUpdated} updated`);
  console.log(`  • Default backend seeds: ${defaultSeedsCreated} new, ${defaultSeedsSkipped} existing`);
  console.log(`  • Complexity profiles: ${profilesCreated} new, ${profilesSkipped} existing`);
  console.log("\n📌 All system seeds have organizationId: null and are shared across ALL organizations.");
  console.log("📌 Organizations can create their own custom seeds that override defaults.");
}

main()
  .catch((e) => {
    console.error("❌ Production seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
