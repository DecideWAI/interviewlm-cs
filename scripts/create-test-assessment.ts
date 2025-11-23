
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    // 1. Find the test organization
    const org = await prisma.organization.findUnique({
        where: { slug: "test-org" },
    });

    if (!org) {
        console.error("Test organization not found");
        process.exit(1);
    }

    // 2. Find a backend problem seed
    const seed = await prisma.problemSeed.findFirst({
        where: {
            organizationId: org.id,
            category: "backend",
        },
    });

    if (!seed) {
        console.error("No backend seed found");
        process.exit(1);
    }

    // 3. Create Assessment
    const user = await prisma.user.findUnique({ where: { email: "test@interviewlm.com" } });
    if (!user) throw new Error("Test user not found");

    const assessment = await prisma.assessment.create({
        data: {
            organizationId: org.id,
            createdById: user.id,
            title: "Test Backend Assessment",
            role: "Backend Developer",
            seniority: "SENIOR",
            duration: 60,
            techStack: ["Node.js", "PostgreSQL"],
            status: "PUBLISHED",
            questions: {
                create: {
                    order: 1,
                    title: seed.title,
                    description: seed.description,
                    difficulty: seed.difficulty,
                    type: "CODING",
                    problemSeedId: seed.id,
                },
            },
        },
    });

    // 4. Create Candidate
    const candidate = await prisma.candidate.create({
        data: {
            organizationId: org.id,
            assessmentId: assessment.id,
            createdById: user.id,
            name: "Test Candidate",
            email: "candidate@example.com",
            invitationToken: "test-token-" + Date.now(),
        },
    });

    console.log(`Interview Link: http://localhost:3002/interview/${candidate.invitationToken}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
