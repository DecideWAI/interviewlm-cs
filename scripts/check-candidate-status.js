const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStatus() {
    try {
        const candidate = await prisma.candidate.findFirst({
            where: { invitationToken: 'test-token-1763893234102' },
            include: {
                evaluation: true,
                sessionRecording: true,
                generatedQuestions: true
            }
        });

        console.log('Candidate Status:');
        console.log('- Status:', candidate?.status);
        console.log('- Evaluation exists:', !!candidate?.evaluation);
        console.log('- Questions generated:', candidate?.generatedQuestions?.length || 0);
        console.log('\nFull candidate data:');
        console.log(JSON.stringify(candidate, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkStatus();
