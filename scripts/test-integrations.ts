#!/usr/bin/env ts-node
/**
 * Test Integration Script
 * Verifies all external service integrations are working
 */

import { paddleService } from "../lib/services/paddle";
import { emailService } from "../lib/services/email";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, "green");
}

function error(message: string) {
  log(`❌ ${message}`, "red");
}

function warning(message: string) {
  log(`⚠️  ${message}`, "yellow");
}

function info(message: string) {
  log(`ℹ️  ${message}`, "blue");
}

function section(title: string) {
  console.log();
  log(`━━━ ${title} ━━━`, "cyan");
}

/**
 * Test environment variables
 */
async function testEnvironmentVariables() {
  section("Environment Variables");

  const requiredVars = [
    { name: "DATABASE_URL", secret: true },
    { name: "NEXTAUTH_SECRET", secret: true },
    { name: "MODAL_TOKEN_ID", secret: false },
    { name: "MODAL_TOKEN_SECRET", secret: true },
    { name: "ANTHROPIC_API_KEY", secret: true },
    { name: "RESEND_API_KEY", secret: true },
    { name: "PADDLE_VENDOR_ID", secret: false },
    { name: "PADDLE_API_KEY", secret: true },
    { name: "PADDLE_PUBLIC_KEY", secret: false },
  ];

  let missingVars = 0;

  for (const { name, secret } of requiredVars) {
    const value = process.env[name];
    if (value) {
      const display = secret ? `${value.substring(0, 8)}...` : value;
      success(`${name}: ${display}`);
    } else {
      error(`${name}: NOT SET`);
      missingVars++;
    }
  }

  if (missingVars > 0) {
    warning(
      `\n${missingVars} required environment variable(s) missing. Check .env.local`
    );
    return false;
  }

  return true;
}

/**
 * Test Modal AI connection
 */
async function testModalConnection() {
  section("Modal AI Integration");

  try {
    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;

    if (!tokenId || !tokenSecret) {
      error("Modal credentials not set");
      info(
        "Get your credentials from: https://modal.com/settings/tokens"
      );
      return false;
    }

    info("Testing Modal API connection...");

    // Import modal service (will fail if Modal API is down)
    const modalService = await import("../lib/services/modal");

    // Try to list volumes (simple API test)
    try {
      await modalService.listVolumes();
      success("Modal API connection successful");
      return true;
    } catch (err) {
      error(
        `Modal API error: ${err instanceof Error ? err.message : "Unknown"}`
      );
      info("Check your MODAL_TOKEN_ID and MODAL_TOKEN_SECRET");
      return false;
    }
  } catch (err) {
    error(`Modal test failed: ${err instanceof Error ? err.message : "Unknown"}`);
    return false;
  }
}

/**
 * Test Anthropic Claude API
 */
async function testAnthropicConnection() {
  section("Anthropic Claude API Integration");

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      error("Anthropic API key not set");
      info(
        "Get your API key from: https://console.anthropic.com/settings/keys"
      );
      return false;
    }

    info("Testing Anthropic API connection...");

    // Import Claude service
    const claudeService = await import("../lib/services/claude");

    // Try a simple API call
    try {
      const response = await claudeService.getChatCompletion(
        [{ role: "user", content: "Say 'Hello from InterviewLM test!'" }],
        {
          problemTitle: "Integration Test",
          problemDescription: "Testing Claude API connection",
          language: "javascript",
        }
      );

      if (response.content.toLowerCase().includes("hello")) {
        success("Claude API connection successful");
        info(`Response: ${response.content.substring(0, 50)}...`);
        info(`Tokens used: ${response.usage.totalTokens}`);
        return true;
      } else {
        warning("Claude responded but content unexpected");
        return false;
      }
    } catch (err) {
      error(
        `Claude API error: ${err instanceof Error ? err.message : "Unknown"}`
      );
      info("Check your ANTHROPIC_API_KEY and billing status");
      return false;
    }
  } catch (err) {
    error(`Claude test failed: ${err instanceof Error ? err.message : "Unknown"}`);
    return false;
  }
}

/**
 * Test Resend email
 */
async function testResendConnection() {
  section("Resend Email Integration");

  try {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey) {
      error("Resend API key not set");
      info("Get your API key from: https://resend.com/api-keys");
      return false;
    }

    if (!fromEmail) {
      error("RESEND_FROM_EMAIL not set");
      info(
        "Use 'onboarding@resend.dev' for testing or verify your own domain"
      );
      return false;
    }

    info("Resend configuration looks good");
    success(`From email: ${fromEmail}`);

    warning(
      "⏭️  Skipping actual email send test (to avoid hitting rate limits)"
    );
    info("To test email sending, run:");
    info("  curl -X POST http://localhost:3000/api/test/send-email");

    return true;
  } catch (err) {
    error(`Resend test failed: ${err instanceof Error ? err.message : "Unknown"}`);
    return false;
  }
}

/**
 * Test Paddle configuration
 */
async function testPaddleConfiguration() {
  section("Paddle Payment Integration");

  try {
    const vendorId = process.env.PADDLE_VENDOR_ID;
    const apiKey = process.env.PADDLE_API_KEY;
    const publicKey = process.env.PADDLE_PUBLIC_KEY;
    const environment = process.env.PADDLE_ENVIRONMENT || "sandbox";

    if (!vendorId || !apiKey || !publicKey) {
      error("Paddle credentials not complete");
      info(
        "Get your credentials from: https://vendors.paddle.com/authentication"
      );
      return false;
    }

    info(`Environment: ${environment.toUpperCase()}`);
    success(`Vendor ID: ${vendorId}`);
    success(`API Key: ${apiKey.substring(0, 8)}...`);
    success(`Public Key: ${publicKey.substring(0, 15)}...`);

    // Check product IDs
    const productSingle = process.env.PADDLE_PRODUCT_SINGLE;
    const productMedium = process.env.PADDLE_PRODUCT_MEDIUM;
    const productEnterprise = process.env.PADDLE_PRODUCT_ENTERPRISE;

    if (productSingle && productMedium && productEnterprise) {
      success("All product IDs configured");
    } else {
      warning("Some product IDs not set");
      info(
        "Create products at: https://vendors.paddle.com/products"
      );
    }

    warning("⏭️  Skipping Paddle API test (requires webhook setup)");
    info("To test Paddle checkout, visit:");
    info("  http://localhost:3000/pricing");

    return true;
  } catch (err) {
    error(`Paddle test failed: ${err instanceof Error ? err.message : "Unknown"}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function main() {
  log("\n╔══════════════════════════════════════════════╗", "bright");
  log("║   InterviewLM Integration Test Suite        ║", "bright");
  log("╚══════════════════════════════════════════════╝\n", "bright");

  const results = {
    env: await testEnvironmentVariables(),
    modal: await testModalConnection(),
    claude: await testAnthropicConnection(),
    resend: await testResendConnection(),
    paddle: await testPaddleConfiguration(),
  };

  section("Test Summary");

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  const failedTests = totalTests - passedTests;

  console.log();
  log(`Total Tests: ${totalTests}`, "bright");
  success(`Passed: ${passedTests}`);
  if (failedTests > 0) {
    error(`Failed: ${failedTests}`);
  }

  console.log();
  if (passedTests === totalTests) {
    log("🎉 All integrations configured correctly!", "green");
    log("You're ready to launch! 🚀\n", "green");
    process.exit(0);
  } else {
    log("⚠️  Some integrations need attention", "yellow");
    log("Review the errors above and check your .env.local\n", "yellow");
    process.exit(1);
  }
}

// Run tests
main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
