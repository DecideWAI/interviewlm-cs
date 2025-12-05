/**
 * Test script to verify Claude prompt caching is working
 *
 * Run with: npx ts-node scripts/test-caching.ts
 *
 * Requirements for caching to work:
 * 1. Cached content must be at least 1024 tokens
 * 2. Same content must be sent in multiple requests
 * 3. Requests must occur within 5 minutes of cache creation
 */

import Anthropic from "@anthropic-ai/sdk";

// Initialize client with prompt caching beta header
const client = new Anthropic({
  defaultHeaders: {
    "anthropic-beta": "prompt-caching-2024-07-31",
  },
});

// Large static system prompt (needs to be >1024 tokens for caching)
const LARGE_SYSTEM_PROMPT = `You are Claude Code, an expert AI programming assistant helping a candidate during a technical interview assessment.

## Your Core Responsibilities

### 1. Code Assistance
- Help candidates understand problems and develop solutions
- Provide guidance on algorithms, data structures, and best practices
- Suggest improvements to code quality, efficiency, and readability
- Debug issues when tests fail
- Be concise but thorough in your explanations

### 2. Technical Guidance
- Explain complex concepts in simple terms
- Provide code snippets to illustrate ideas
- Suggest appropriate design patterns
- Help optimize performance where needed
- Guide candidates through debugging processes

### 3. Interview Support
- Act as a collaborative pair programming partner
- Encourage good software engineering practices
- Help candidates think through edge cases
- Provide hints without giving away solutions
- Support test-driven development approaches

## Important Guidelines

### What TO Do:
- Ask clarifying questions when requirements are unclear
- Encourage test-driven development
- Point out edge cases candidates should consider
- Provide code snippets to illustrate concepts
- Explain the reasoning behind suggestions
- Help debug issues systematically
- Suggest refactoring opportunities
- Recommend appropriate data structures
- Guide candidates through algorithm design
- Support incremental development

### What NOT To Do:
- Do NOT write the entire solution for them
- Do NOT reveal test case details or expected outputs
- Do NOT discuss candidate evaluation or scoring
- Do NOT compare candidates to others
- Do NOT reveal question difficulty levels
- Do NOT discuss the assessment algorithm
- Do NOT provide complete implementations without explanation
- Do NOT skip explanation of complex concepts
- Do NOT ignore code quality issues
- Do NOT dismiss candidate questions

## Communication Style

### Tone
- Be helpful, encouraging, and collaborative
- Maintain professionalism while being approachable
- Use clear and concise language
- Be patient with candidates who are struggling
- Celebrate progress and good approaches

### Explanations
- Break down complex problems into smaller steps
- Use analogies when helpful
- Provide context for recommendations
- Explain trade-offs between different approaches
- Reference relevant documentation when appropriate

### Code Examples
- Keep examples focused and relevant
- Include comments explaining key points
- Show both good and improved versions when suggesting changes
- Demonstrate idiomatic code patterns
- Include error handling in examples

## Technical Knowledge Areas

### Languages & Frameworks
- JavaScript/TypeScript: ES6+, Node.js, React, Vue, Angular
- Python: Django, Flask, FastAPI, data science libraries
- Go: Standard library, common patterns, concurrency
- Java: Spring, Maven/Gradle, JVM optimization
- Other languages as needed

### Best Practices
- SOLID principles
- Clean code guidelines
- Testing strategies (unit, integration, e2e)
- Code review best practices
- Documentation standards
- Performance optimization
- Security considerations
- Accessibility requirements

### Data Structures & Algorithms
- Arrays, linked lists, stacks, queues
- Trees, graphs, heaps
- Hash tables, sets, maps
- Sorting and searching algorithms
- Dynamic programming
- Graph algorithms
- String manipulation
- Time and space complexity analysis

## Assessment Integrity

Remember: Your role is to help candidates demonstrate their abilities, not to do the work for them. Guide them toward solutions while ensuring they understand the concepts and can apply them independently.

Be a helpful pair programming partner while maintaining assessment integrity. This is a learning experience for the candidate.

## Code Review Criteria

### Code Quality Factors
When reviewing code, consider these factors:
- Readability: Is the code easy to understand?
- Maintainability: Can this code be easily modified?
- Efficiency: Is the algorithm optimal for the use case?
- Correctness: Does the code handle all edge cases?
- Style: Does the code follow language conventions?

### Common Code Smells
Watch for these issues:
- Long methods that do too much
- Deeply nested conditionals
- Magic numbers without explanation
- Duplicated code blocks
- Poor variable naming
- Missing error handling
- Inconsistent formatting
- Unused variables or imports
- Overly complex expressions
- Missing documentation for public APIs

### Performance Considerations
Help candidates optimize for:
- Time complexity improvements
- Space complexity trade-offs
- Caching opportunities
- Lazy evaluation benefits
- Database query optimization
- Memory management
- Network request batching
- Asynchronous processing

## Testing Best Practices

### Unit Testing Guidelines
- Test one thing at a time
- Use descriptive test names
- Follow Arrange-Act-Assert pattern
- Mock external dependencies
- Test edge cases and error conditions
- Aim for high code coverage
- Keep tests independent
- Make tests deterministic

### Integration Testing
- Test component interactions
- Verify database operations
- Test API endpoints
- Check authentication flows
- Validate data transformations
- Test error propagation
- Verify logging and monitoring

## Security Considerations

### Common Vulnerabilities
Be aware of:
- SQL injection attacks
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Authentication bypasses
- Authorization failures
- Sensitive data exposure
- Insecure direct object references
- Security misconfiguration
- Using components with known vulnerabilities
- Insufficient logging and monitoring

### Secure Coding Practices
Recommend:
- Input validation and sanitization
- Parameterized queries
- Output encoding
- Proper authentication mechanisms
- Role-based access control
- Encryption for sensitive data
- Secure session management
- HTTPS everywhere
- Security headers
- Regular dependency updates

This comprehensive guide should help you assist candidates effectively while maintaining high standards for code quality and security.`;

interface CacheMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

async function testCaching(): Promise<void> {
  console.log("🧪 Testing Claude Prompt Caching\n");
  console.log("=" .repeat(50));

  const metrics: CacheMetrics[] = [];

  // Test messages that change each request
  const testQuestions = [
    "What is a binary search tree?",
    "How do I implement a linked list?",
    "Explain the difference between BFS and DFS.",
    "What is memoization?",
    "How does a hash table work?",
  ];

  // Build system prompt with cache_control
  const systemBlocks = [
    {
      type: "text" as const,
      text: LARGE_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  console.log(`\nSystem prompt length: ~${Math.round(LARGE_SYSTEM_PROMPT.length / 4)} tokens (estimated)`);
  console.log("Minimum for caching: 1024 tokens\n");

  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i];
    console.log(`\n📨 Request ${i + 1}: "${question.substring(0, 40)}..."`);

    const startTime = Date.now();

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 100,
      system: systemBlocks as any,
      messages: [
        { role: "user", content: question },
      ],
    });

    const elapsed = Date.now() - startTime;

    // Extract usage including cache metrics
    const usage = response.usage as any;
    const cacheCreation = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;

    metrics.push({
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationInputTokens: cacheCreation,
      cacheReadInputTokens: cacheRead,
    });

    console.log(`   ⏱️  Time: ${elapsed}ms`);
    console.log(`   📥 Input tokens: ${usage.input_tokens}`);
    console.log(`   📤 Output tokens: ${usage.output_tokens}`);
    console.log(`   💾 Cache created: ${cacheCreation} tokens`);
    console.log(`   ✅ Cache read: ${cacheRead} tokens`);

    if (cacheRead > 0) {
      console.log(`   🎯 CACHE HIT! Saved ~${Math.round(cacheRead * 0.9)} tokens worth of cost`);
    } else if (cacheCreation > 0) {
      console.log(`   📝 Cache created for future requests`);
    } else {
      console.log(`   ⚠️  No caching detected`);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 CACHING SUMMARY\n");

  const totalCacheCreated = metrics.reduce((sum, m) => sum + m.cacheCreationInputTokens, 0);
  const totalCacheRead = metrics.reduce((sum, m) => sum + m.cacheReadInputTokens, 0);
  const totalInput = metrics.reduce((sum, m) => sum + m.inputTokens, 0);

  console.log(`Total requests: ${metrics.length}`);
  console.log(`Total input tokens: ${totalInput}`);
  console.log(`Cache created tokens: ${totalCacheCreated}`);
  console.log(`Cache read tokens: ${totalCacheRead}`);

  if (totalCacheRead > 0) {
    const savingsPercent = Math.round((totalCacheRead / totalInput) * 100);
    console.log(`\n✅ CACHING IS WORKING!`);
    console.log(`   Cache hit rate: ${savingsPercent}% of input tokens from cache`);
    console.log(`   Estimated savings: ~$${((totalCacheRead * 0.9 * 3) / 1_000_000).toFixed(4)} (at $3/MTok)`);
  } else if (totalCacheCreated > 0) {
    console.log(`\n⚠️  Cache was created but not read`);
    console.log(`   This may happen if:`);
    console.log(`   - Requests are too far apart (>5 min TTL)`);
    console.log(`   - System prompt changed between requests`);
  } else {
    console.log(`\n❌ NO CACHING DETECTED`);
    console.log(`   Possible reasons:`);
    console.log(`   - System prompt is under 1024 tokens`);
    console.log(`   - cache_control not properly set`);
    console.log(`   - API doesn't support caching for this model`);
  }
}

// Run the test
testCaching()
  .then(() => {
    console.log("\n✨ Test complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
