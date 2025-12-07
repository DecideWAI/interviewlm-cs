#!/usr/bin/env npx tsx
/**
 * Diagnostic script to analyze why the coding agent uses Bash for file writing
 * instead of the WriteFile tool.
 *
 * Run: npx tsx scripts/diagnose-bash-file-writing.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

interface Finding {
  file: string;
  line: number;
  issue: string;
  snippet: string;
  severity: 'error' | 'warning' | 'info';
}

const findings: Finding[] = [];

function log(color: string, prefix: string, message: string) {
  console.log(`${color}${prefix}${RESET} ${message}`);
}

function addFinding(finding: Finding) {
  findings.push(finding);
}

// Check 1: Analyze the system prompt
function analyzeSystemPrompt() {
  log(BLUE, '\n[1/5]', 'Analyzing system prompt...');

  const promptPath = path.join(process.cwd(), 'lib/prompts/coding-agent-system.ts');
  const content = fs.readFileSync(promptPath, 'utf-8');

  // Check if banned_patterns section exists
  if (content.includes('<banned_patterns>')) {
    log(GREEN, '  ✓', 'Found <banned_patterns> section');
  } else {
    addFinding({
      file: promptPath,
      line: 0,
      issue: 'Missing <banned_patterns> section in system prompt',
      snippet: '',
      severity: 'error'
    });
  }

  // Check if the ban is clear enough
  const bannedSection = content.match(/<banned_patterns>([\s\S]*?)<\/banned_patterns>/);
  if (bannedSection) {
    const section = bannedSection[1];
    console.log(`  ${YELLOW}Banned patterns section:${RESET}`);
    section.split('\n').filter(l => l.trim()).forEach(l => {
      console.log(`    ${l.trim()}`);
    });

    // Check if it mentions consequences
    if (!section.includes('REJECT') && !section.includes('ERROR') && !section.includes('FAIL')) {
      addFinding({
        file: promptPath,
        line: 0,
        issue: 'Banned patterns section lacks explicit consequences (REJECT/ERROR/FAIL)',
        snippet: section.substring(0, 200),
        severity: 'warning'
      });
    }
  }

  // Check if WriteFile is emphasized enough
  const writeFileRefs = (content.match(/WriteFile/g) || []).length;
  log(writeFileRefs >= 5 ? GREEN : YELLOW, '  →', `WriteFile mentioned ${writeFileRefs} times in prompt`);

  if (writeFileRefs < 5) {
    addFinding({
      file: promptPath,
      line: 0,
      issue: `WriteFile only mentioned ${writeFileRefs} times - may need more emphasis`,
      snippet: '',
      severity: 'warning'
    });
  }
}

// Check 2: Analyze tool definitions
function analyzeToolDefinitions() {
  log(BLUE, '\n[2/5]', 'Analyzing tool definitions...');

  const agentPath = path.join(process.cwd(), 'lib/agents/coding-agent.ts');
  const content = fs.readFileSync(agentPath, 'utf-8');

  // Find Bash tool definition
  const bashToolMatch = content.match(/name:\s*['"]Bash['"][\s\S]*?description:\s*(['"`])([\s\S]*?)\1/);
  if (bashToolMatch) {
    const bashDesc = bashToolMatch[2];
    console.log(`  ${YELLOW}Bash tool description:${RESET}`);
    bashDesc.split('\\n').slice(0, 5).forEach(l => {
      console.log(`    ${l.trim()}`);
    });

    if (!bashDesc.includes('Do NOT use') && !bashDesc.includes('NEVER use')) {
      addFinding({
        file: agentPath,
        line: 0,
        issue: 'Bash tool description does not strongly discourage file writing',
        snippet: bashDesc.substring(0, 200),
        severity: 'warning'
      });
    } else {
      log(GREEN, '  ✓', 'Bash tool description includes file writing warning');
    }
  }

  // Find WriteFile tool definition
  const writeToolMatch = content.match(/name:\s*['"]WriteFile['"][\s\S]*?description:\s*(['"`])([\s\S]*?)\1/);
  if (writeToolMatch) {
    const writeDesc = writeToolMatch[2];
    if (writeDesc.includes('PREFERRED') || writeDesc.includes('preferred')) {
      log(GREEN, '  ✓', 'WriteFile marked as preferred method');
    } else {
      addFinding({
        file: agentPath,
        line: 0,
        issue: 'WriteFile not marked as PREFERRED method',
        snippet: writeDesc.substring(0, 200),
        severity: 'warning'
      });
    }
  }
}

// Check 3: Check for runtime validation
function analyzeRuntimeValidation() {
  log(BLUE, '\n[3/5]', 'Checking for runtime validation of Bash commands...');

  const agentPath = path.join(process.cwd(), 'lib/agents/coding-agent.ts');
  const content = fs.readFileSync(agentPath, 'utf-8');

  // Look for the file write blocking pattern in the agent
  const hasFileWritePatterns = content.includes('fileWritePatterns') &&
                                content.includes('/cat\\s*>/') ||
                                content.includes('cat\\\\s*>');

  const hasBlockingLogic = content.includes('Blocked Bash file-writing command') ||
                           content.includes('Do not use Bash for file writing');

  const hasValidation = hasFileWritePatterns || hasBlockingLogic;

  if (!hasValidation) {
    addFinding({
      file: agentPath,
      line: 0,
      issue: 'NO RUNTIME VALIDATION exists to block Bash file-writing commands',
      snippet: 'The agent will execute cat/heredoc commands without checking',
      severity: 'error'
    });
    log(RED, '  ✗', 'No runtime validation found for Bash file-writing patterns');
    log(YELLOW, '  →', 'This is the ROOT CAUSE - prompts alone are not reliable');
  } else {
    log(GREEN, '  ✓', 'Runtime validation exists for Bash file-writing');

    // Show what patterns are blocked
    const patternMatch = content.match(/fileWritePatterns\s*=\s*\[([\s\S]*?)\];/);
    if (patternMatch) {
      console.log(`  ${YELLOW}Blocked patterns:${RESET}`);
      patternMatch[1].split('\n').filter(l => l.includes('/')).forEach(l => {
        console.log(`    ${l.trim()}`);
      });
    }
  }
}

// Check 4: Analyze bash tool implementation
function analyzeBashToolImplementation() {
  log(BLUE, '\n[4/5]', 'Analyzing Bash tool implementation...');

  const bashToolPath = path.join(process.cwd(), 'lib/agent-tools/bash.ts');

  if (!fs.existsSync(bashToolPath)) {
    log(YELLOW, '  →', 'Bash tool file not found at expected path');
    return;
  }

  const content = fs.readFileSync(bashToolPath, 'utf-8');

  // Check if there's any command filtering
  const hasFiltering = content.includes('cat') ||
                       content.includes('heredoc') ||
                       content.includes('>>') ||
                       content.includes('file writing');

  if (!hasFiltering) {
    addFinding({
      file: bashToolPath,
      line: 0,
      issue: 'Bash tool has no filtering for file-writing commands',
      snippet: 'Commands like "cat > file" pass through unchecked',
      severity: 'error'
    });
    log(RED, '  ✗', 'No command filtering in bash tool');
  }

  // Show what commands are blocked (if any)
  const blockedMatch = content.match(/blocked|forbidden|reject|deny/gi);
  if (blockedMatch) {
    log(GREEN, '  ✓', `Found ${blockedMatch.length} blocking-related terms`);
  }
}

// Check 5: Suggest fixes
function suggestFixes() {
  log(BLUE, '\n[5/5]', 'Generating recommendations...');

  console.log(`\n${BOLD}${YELLOW}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}DIAGNOSIS SUMMARY${RESET}`);
  console.log(`${YELLOW}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');

  console.log(`${RED}Errors: ${errors.length}${RESET}`);
  console.log(`${YELLOW}Warnings: ${warnings.length}${RESET}\n`);

  if (errors.length > 0) {
    console.log(`${BOLD}${RED}CRITICAL ISSUES:${RESET}`);
    errors.forEach((e, i) => {
      console.log(`\n${i + 1}. ${e.issue}`);
      console.log(`   File: ${e.file}`);
      if (e.snippet) console.log(`   Detail: ${e.snippet.substring(0, 100)}...`);
    });
  }

  console.log(`\n${BOLD}${GREEN}RECOMMENDED FIX:${RESET}`);
  console.log(`
Add runtime validation in lib/agents/coding-agent.ts to detect and REJECT
Bash commands that attempt file writing. The prompt-based approach alone
is insufficient because:

1. LLMs can ignore or "forget" prompt instructions
2. Complex multi-step tasks cause context drift
3. The model may rationalize using Bash as "faster" or "more convenient"

${BOLD}Add this validation before executing Bash commands:${RESET}

\`\`\`typescript
// In executeToolsWithCallbacks, after the WriteFile validation:

// Block Bash commands that write files (use WriteFile instead)
if (toolBlock.name === 'Bash') {
  const command = (toolBlock.input.command as string) || '';
  const fileWritePatterns = [
    /cat\\s*>/, /cat\\s*>>/, /cat\\s*<</, // cat with redirection or heredoc
    /echo\\s+.*>/, /echo\\s+.*>>/, // echo redirection
    /printf\\s+.*>/, /printf\\s+.*>>/, // printf redirection
    /tee\\s+/, // tee command
    />\\s*\\/workspace/, // any redirect to workspace
  ];

  const isFileWrite = fileWritePatterns.some(p => p.test(command));
  if (isFileWrite) {
    console.warn('[StreamingAgent] Blocked Bash file-writing command:', command.substring(0, 100));

    const error =
      'ERROR: Do not use Bash for file writing. Use the WriteFile tool instead.\\n' +
      'WriteFile is faster, more reliable, and handles encoding correctly.\\n' +
      'Example: WriteFile({ path: "/workspace/file.py", content: "your code" })';

    callbacks.onToolResult?.(toolBlock.name, toolBlock.id, { success: false, error }, true);
    return {
      type: 'tool_result' as const,
      tool_use_id: toolBlock.id,
      content: JSON.stringify({ success: false, error }),
      is_error: true,
    };
  }
}
\`\`\`
`);
}

// Run all checks
console.log(`${BOLD}${BLUE}╔═══════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}${BLUE}║  Diagnosing: Why is Bash used for file writing?              ║${RESET}`);
console.log(`${BOLD}${BLUE}╚═══════════════════════════════════════════════════════════════╝${RESET}`);

try {
  analyzeSystemPrompt();
  analyzeToolDefinitions();
  analyzeRuntimeValidation();
  analyzeBashToolImplementation();
  suggestFixes();
} catch (error) {
  console.error(`${RED}Error running diagnostics:${RESET}`, error);
  process.exit(1);
}
