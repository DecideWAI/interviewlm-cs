
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const id = 'cmj3zn4yw00016ni1chz5s85j';
    console.log(`Searching for SessionRecording with ID: ${id}`);

    let sessionRecording = await prisma.sessionRecording.findUnique({
        where: { id },
        include: {
            candidate: {
                include: {
                    assessment: true
                }
            },
            events: true,
            claudeInteractions: true,
            codeSnapshots: true,
            testResults: true
        }
    });

    if (!sessionRecording) {
        console.log(`SessionRecording not found by ID. Trying candidateId...`);
        sessionRecording = await prisma.sessionRecording.findUnique({
            where: { candidateId: id },
            include: {
                candidate: {
                    include: {
                        assessment: true
                    }
                },
                events: true,
                claudeInteractions: true,
                codeSnapshots: true,
                testResults: true
            }
        });
    }

    if (sessionRecording) {
        console.log('Found SessionRecording:');
        console.log(JSON.stringify(sessionRecording, null, 2));
    } else {
        console.log('SessionRecording not found.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
