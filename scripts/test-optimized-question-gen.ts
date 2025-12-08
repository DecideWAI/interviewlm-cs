/**
 * Test: Optimized Question Generation
 *
 * Verifies that the dynamic question generator uses the fast path
 */

import { dynamicQuestionGenerator } from "../lib/services/dynamic-question-generator";

async function main() {
  console.log("🚀 Testing Optimized Question Generation\n");
  console.log("=".repeat(60));

  const startTime = Date.now();

  try {
    console.log("\n📊 Generating question with optimized path (Haiku)...\n");

    const result = await dynamicQuestionGenerator.generate({
      role: "backend",
      seniority: "mid",
      assessmentType: "REAL_WORLD",
      techStack: ["python"],
    });

    const totalTime = Date.now() - startTime;

    console.log("\n" + "=".repeat(60));
    console.log("📈 RESULTS\n");

    console.log(`✅ Question Generated Successfully!`);
    console.log(`   Title: ${result.title}`);
    console.log(`   Requirements: ${result.requirements.length} items`);
    console.log(`   Starter code: ${result.starterCode.length} chars`);
    console.log(`\n⏱️  Total Time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);

    if (totalTime < 20000) {
      console.log(`\n✅ SUCCESS: Question generation is within 20s target!`);
    } else if (totalTime < 30000) {
      console.log(`\n⚠️  PARTIAL: Question generation is between 20-30s`);
    } else {
      console.log(`\n❌ SLOW: Question generation took > 30s`);
    }

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
