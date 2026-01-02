import { PrismaClient } from "@prisma/client";
import {
    LANGUAGES,
    FRAMEWORKS,
    DATABASES,
    TESTING,
    TOOLS,
} from "../lib/tech-catalog";

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding technologies...");

    const allTechs = [
        ...Object.values(LANGUAGES),
        ...Object.values(FRAMEWORKS),
        ...Object.values(DATABASES),
        ...Object.values(TESTING),
        ...Object.values(TOOLS),
    ];

    // 1. Create all technologies first
    for (const tech of allTechs) {
        const existing = await prisma.technology.findFirst({
            where: {
                slug: tech.id,
                organizationId: null,
            },
        });

        if (existing) {
            await prisma.technology.update({
                where: { id: existing.id },
                data: {
                    name: tech.name,
                    category: tech.category,
                    icon: tech.icon,
                    description: tech.description,
                    color: tech.color,
                    detectionPatterns: (tech.detectionPatterns as any) || [],
                },
            });
        } else {
            await prisma.technology.create({
                data: {
                    slug: tech.id,
                    name: tech.name,
                    category: tech.category,
                    icon: tech.icon,
                    description: tech.description,
                    color: tech.color,
                    detectionPatterns: (tech.detectionPatterns as any) || [],
                    organizationId: null,
                },
            });
        }
        console.log(`Upserted tech: ${tech.name}`);
    }

    // 2. Update relationships (commonlyPairedWith)
    console.log("Updating relationships...");
    for (const tech of allTechs) {
        if (tech.commonlyPairedWith && tech.commonlyPairedWith.length > 0) {
            // Filter out IDs that might not exist in our seed data (just in case)
            const validPairedIds = tech.commonlyPairedWith.filter((id) =>
                allTechs.some((t) => t.id === id)
            );

            if (validPairedIds.length > 0) {
                // Find the technology by slug and organizationId
                const existingTech = await prisma.technology.findFirst({
                    where: {
                        slug: tech.id,
                        organizationId: null,
                    },
                });

                if (existingTech) {
                    await prisma.technology.update({
                        where: { id: existingTech.id },
                        data: {
                            pairedWithIds: validPairedIds,
                        },
                    });
                    console.log(`Updated pairs for: ${tech.name}`);
                }
            }
        }
    }

    console.log("Seeding completed.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
