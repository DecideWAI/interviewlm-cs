
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEval() {
    try {
        const evals = await prisma.evaluation.findMany({
            include: { candidate: true }
        });
        console.log(JSON.stringify(evals, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkEval();
