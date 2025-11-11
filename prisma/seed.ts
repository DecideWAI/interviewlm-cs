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

  console.log("\n🎉 Seed completed successfully!");
  console.log("\nTest credentials:");
  console.log("  Email: test@interviewlm.com");
  console.log(`  Password: ${seedPassword}`);
  console.log("\nAdmin credentials:");
  console.log("  Email: admin@interviewlm.com");
  console.log(`  Password: ${seedPassword}`);
  console.log("\n💡 Tip: Set SEED_PASSWORD environment variable for consistent credentials");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
