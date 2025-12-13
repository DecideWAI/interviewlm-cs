
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const id = 'cmj3zn4yw00016ni1chz5s85j';
    // Try finding by ID first, then candidateId
    let session = await prisma.sessionRecording.findUnique({
        where: { id },
        include: { events: true }
    });

    if (!session) {
        session = await prisma.sessionRecording.findUnique({
            where: { candidateId: id },
            include: { events: true }
        });
    }

    if (session) {
        console.log(`Found session with ${session.events.length} events (raw events).`);
        // Check for other types
        const interactions = await prisma.claudeInteraction.findMany({ where: { sessionId: session.id } });
        const snapshots = await prisma.codeSnapshot.findMany({ where: { sessionId: session.id } });
        const tests = await prisma.testResult.findMany({ where: { sessionId: session.id } });
        const terminalCommands = await prisma.terminalCommand.findMany({ where: { sessionId: session.id } });

        console.log(`Claude Interactions: ${interactions.length}`);
        console.log(`Code Snapshots: ${snapshots.length}`);
        console.log(`Test Results: ${tests.length}`);
        console.log(`Terminal Commands: ${terminalCommands.length}`);

        // Sort all by timestamp to see the sequence
        const all = [
            ...session.events.map(e => ({ type: e.type, time: e.timestamp, data: e.data })),
            ...interactions.map(e => ({ type: 'ai_message', time: e.timestamp })),
            ...snapshots.map(e => ({ type: 'code_snapshot', time: e.timestamp })),
            ...tests.map(e => ({ type: 'test_result', time: e.timestamp }))
        ].sort((a, b) => new Date(a.time) - new Date(b.time));

        console.log("Timeline Summary:");
        all.forEach((e, i) => {
            console.log(`${i}: ${e.time.toISOString()} - ${e.type}`);
            if (e.type === 'terminal_output' || e.type === 'test_result') {
                console.log(JSON.stringify(e.data));
            }
        });

    } else {
        console.log("Session not found");
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
