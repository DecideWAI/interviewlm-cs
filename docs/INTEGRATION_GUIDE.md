# InterviewLM Integration Guide
**Quick Start: Connect External Services**

Last Updated: 2025-11-12

---

## 🚀 Integration Checklist

- [x] Modal AI account created
- [x] Anthropic API key obtained
- [ ] Resend API configured
- [ ] Paddle integration configured
- [ ] Environment variables set
- [ ] Integrations tested

---

## 1. Modal AI Integration

### **Step 1: Get API Credentials**

You've already created your Modal account. Now get your API credentials:

1. Go to https://modal.com/settings/tokens
2. Click "Create new token"
3. Name it: `interviewlm-production`
4. Copy the Token ID and Token Secret

**Environment Variables:**
```bash
MODAL_TOKEN_ID=your_token_id_here
MODAL_TOKEN_SECRET=your_token_secret_here
MODAL_API_URL=https://api.modal.com/v1
MODAL_WORKSPACE=default
MODAL_VOLUME_NAMESPACE=interviewlm
MODAL_RETENTION_DAYS=7
```

### **Step 2: Deploy Modal Function**

Modal requires you to deploy a Python function that handles code execution. Create a new file in your Modal dashboard or deploy via CLI:

**File: `modal_function.py`** (Deploy this to Modal)

```python
import modal
import subprocess
import json
from typing import Dict, List, Any

app = modal.App("interviewlm-sandbox")

# Create a volume for persistent storage
volume = modal.Volume.from_name("interview-volumes", create_if_missing=True)

# Define the execution image with necessary dependencies
image = (
    modal.Image.debian_slim()
    .pip_install("pytest", "black", "pylint")
    .apt_install("nodejs", "npm")
)

@app.function(
    image=image,
    volumes={"/workspace": volume},
    timeout=300,  # 5 minutes
    memory=512,  # 512 MB
    cpu=1.0,
)
def execute_code(
    code: str,
    test_cases: List[Dict[str, Any]],
    language: str = "javascript",
    volume_name: str = "default"
) -> Dict[str, Any]:
    """
    Execute code with test cases in an isolated environment.

    Args:
        code: The source code to execute
        test_cases: List of test cases with input/expected output
        language: Programming language (javascript, python, typescript, go)
        volume_name: Volume identifier for file persistence

    Returns:
        Execution results with test outcomes
    """

    results = {
        "success": False,
        "testResults": [],
        "stdout": "",
        "stderr": "",
        "error": None
    }

    try:
        # Write code to file
        if language == "python":
            filename = "/workspace/solution.py"
        elif language in ["javascript", "typescript"]:
            filename = "/workspace/solution.js"
        elif language == "go":
            filename = "/workspace/solution.go"
        else:
            raise ValueError(f"Unsupported language: {language}")

        with open(filename, "w") as f:
            f.write(code)

        # Execute test cases
        for test in test_cases:
            test_result = {
                "name": test["name"],
                "passed": False,
                "output": None,
                "error": None,
                "duration": 0
            }

            try:
                # Create test runner based on language
                if language == "python":
                    # Run Python test
                    test_code = f"""
import solution
result = solution.solve({json.dumps(test['input'])})
expected = {json.dumps(test['expected'])}
assert result == expected, f"Expected {{expected}}, got {{result}}"
print("PASS")
"""
                    test_file = "/workspace/test_runner.py"
                    with open(test_file, "w") as f:
                        f.write(test_code)

                    proc = subprocess.run(
                        ["python", test_file],
                        capture_output=True,
                        timeout=10,
                        text=True
                    )

                elif language in ["javascript", "typescript"]:
                    # Run JavaScript test
                    test_code = f"""
const solution = require('./solution.js');
const result = solution({json.dumps(test['input'])});
const expected = {json.dumps(test['expected'])};
if (JSON.stringify(result) === JSON.stringify(expected)) {{
    console.log('PASS');
}} else {{
    throw new Error(`Expected ${{expected}}, got ${{result}}`);
}}
"""
                    test_file = "/workspace/test_runner.js"
                    with open(test_file, "w") as f:
                        f.write(test_code)

                    proc = subprocess.run(
                        ["node", test_file],
                        capture_output=True,
                        timeout=10,
                        text=True
                    )

                test_result["output"] = proc.stdout
                test_result["passed"] = proc.returncode == 0 and "PASS" in proc.stdout

                if proc.stderr:
                    test_result["error"] = proc.stderr

            except subprocess.TimeoutExpired:
                test_result["error"] = "Test timed out (10s limit)"
            except Exception as e:
                test_result["error"] = str(e)

            results["testResults"].append(test_result)

        results["success"] = all(t["passed"] for t in results["testResults"])

    except Exception as e:
        results["error"] = str(e)

    return results

@app.function(volumes={"/workspace": volume})
def execute_bash(command: str, working_dir: str = "/workspace") -> Dict[str, Any]:
    """Execute a bash command in the workspace."""
    try:
        proc = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            timeout=30,
            text=True,
            cwd=working_dir
        )

        return {
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "exitCode": proc.returncode
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": str(e),
            "exitCode": 1
        }

@app.function(volumes={"/workspace": volume})
def read_file(path: str) -> str:
    """Read a file from the workspace volume."""
    with open(f"/workspace/{path}", "r") as f:
        return f.read()

@app.function(volumes={"/workspace": volume})
def write_file(path: str, content: str) -> Dict[str, bool]:
    """Write a file to the workspace volume."""
    with open(f"/workspace/{path}", "w") as f:
        f.write(content)
    return {"success": True}
```

**Deploy to Modal:**
```bash
# Install Modal CLI
pip install modal

# Authenticate
modal token new

# Deploy the function
modal deploy modal_function.py
```

### **Step 3: Test Modal Integration**

Create a test script:

```bash
# Test from your Next.js app
curl -X POST http://localhost:3000/api/interview/demo/run-tests \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function add(a, b) { return a + b; }",
    "language": "javascript",
    "testCases": [
      {
        "name": "test_add",
        "input": [2, 3],
        "expectedOutput": 5,
        "hidden": false
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "passed": 1,
  "failed": 0,
  "total": 1,
  "results": [...]
}
```

---

## 2. Anthropic Claude API Integration

### **Step 1: Get API Key**

You've already created your Anthropic account. Get your API key:

1. Go to https://console.anthropic.com/settings/keys
2. Click "Create Key"
3. Name it: `interviewlm-production`
4. Copy the API key (starts with `sk-ant-`)

**Environment Variables:**
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_MAX_TOKENS=4096
```

### **Step 2: Test Claude Integration**

**Test Question Generation:**
```bash
curl -X POST http://localhost:3000/api/interview/demo/initialize \
  -H "Content-Type: application/json"
```

This should generate a question using Claude. Check the response for:
- ✅ `question.title`
- ✅ `question.description`
- ✅ `question.testCases`

**Test AI Agent:**
```bash
# Start a demo interview
# Open http://localhost:3000/interview/demo
# Type in chat: "Help me solve this problem"
# Claude should respond with coding assistance
```

### **Step 3: Monitor Usage**

Track your usage at: https://console.anthropic.com/usage

**Expected Costs:**
- Question generation: ~$0.50/question (5K tokens)
- Agent chat: ~$0.10-0.30/message (1-3K tokens)
- **Total per assessment**: ~$2-3

---

## 3. Resend Email Integration

### **Step 1: Get API Key**

1. Sign up at https://resend.com
2. Go to API Keys
3. Create new key: `interviewlm-production`
4. Copy the key (starts with `re_`)

**Environment Variables:**
```bash
RESEND_API_KEY=re_your_key_here
RESEND_FROM_EMAIL=interviews@yourdomain.com
RESEND_FROM_NAME=InterviewLM
```

### **Step 2: Verify Domain**

**Important**: Resend requires domain verification to send emails.

1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Enter your domain (e.g., `yourdomain.com`)
4. Add DNS records (SPF, DKIM, DMARC) to your DNS provider
5. Wait for verification (usually 5-10 minutes)

**For Testing (Development):**
- Use `onboarding@resend.dev` (no verification needed)
- Limit: 1 email/day, only to your registered email

### **Step 3: Test Email Sending**

```bash
# Test invitation email
curl -X POST http://localhost:3000/api/assessments/test-123/candidates \
  -H "Content-Type: application/json" \
  -H "Cookie: your_auth_cookie" \
  -d '{
    "name": "Test Candidate",
    "email": "your-email@example.com",
    "phone": "+1234567890"
  }'
```

**Check:**
- ✅ Email arrives within 1-2 minutes
- ✅ Links work (interview URL)
- ✅ Formatting looks good (HTML + plain text)

---

## 4. Paddle Payment Integration

### **Step 1: Create Paddle Account**

1. Sign up at https://paddle.com
2. Complete business verification (required for payouts)
3. Set up tax handling (automatic with Paddle)

### **Step 2: Get API Credentials**

1. Go to https://vendors.paddle.com/authentication
2. Generate API keys:
   - **Vendor ID**: Your account ID
   - **API Key**: Secret key for server-side
   - **Public Key**: For client-side Paddle.js

**Environment Variables:**
```bash
PADDLE_VENDOR_ID=your_vendor_id
PADDLE_API_KEY=your_api_key_here
PADDLE_PUBLIC_KEY=your_public_key_here
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_ENVIRONMENT=sandbox  # or 'production'
```

### **Step 3: Create Products**

Create products in Paddle Dashboard:

1. Go to https://vendors.paddle.com/products
2. Create 3 products:

**Product 1: Single Assessment**
- Name: InterviewLM - Single Assessment
- Price: $20
- Type: One-time purchase
- Fulfillment: Custom (webhook-based)

**Product 2: Medium Pack**
- Name: InterviewLM - 50 Assessments
- Price: $750 ($15 each)
- Type: One-time purchase
- Credits: 50

**Product 3: Enterprise**
- Name: InterviewLM - Enterprise (500 Assessments)
- Price: $5,000 ($10 each)
- Type: One-time purchase
- Credits: 500

### **Step 4: Set Up Webhooks**

1. Go to https://vendors.paddle.com/alerts-webhooks
2. Add webhook URL: `https://yourdomain.com/api/webhooks/paddle`
3. Enable these events:
   - ✅ payment_succeeded
   - ✅ payment_failed
   - ✅ subscription_created (if offering subscriptions)
   - ✅ subscription_cancelled
   - ✅ refund_completed

4. Copy webhook secret for verification

### **Step 5: Test Checkout Flow**

```bash
# Visit http://localhost:3000/pricing
# Click "Buy 50 Assessments"
# Should open Paddle checkout overlay
# Use test card: 4242 4242 4242 4242
```

**Paddle Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0027 6000 3184`

---

## 5. Environment Variables Setup

### **Development (.env.local)**

Create `.env.local` in project root:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/interviewlm

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here_generate_with_openssl_rand_base64_32

# Modal AI
MODAL_TOKEN_ID=your_token_id
MODAL_TOKEN_SECRET=your_token_secret
MODAL_API_URL=https://api.modal.com/v1
MODAL_WORKSPACE=default
MODAL_VOLUME_NAMESPACE=interviewlm-dev
MODAL_RETENTION_DAYS=7

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-api03-your_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_MAX_TOKENS=4096

# Resend Email
RESEND_API_KEY=re_your_key_here
RESEND_FROM_EMAIL=onboarding@resend.dev  # For dev testing
RESEND_FROM_NAME=InterviewLM

# Paddle Payments (Sandbox)
PADDLE_VENDOR_ID=your_vendor_id
PADDLE_API_KEY=your_sandbox_api_key
PADDLE_PUBLIC_KEY=your_public_key
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_ENVIRONMENT=sandbox

# Optional: S3 for session replay storage
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=interviewlm-sessions

# Optional: Error tracking
SENTRY_DSN=your_sentry_dsn
```

### **Production (Vercel)**

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

1. Go to https://vercel.com/your-team/interviewlm/settings/environment-variables
2. Add all variables from above (use production keys)
3. Set `NODE_ENV=production`
4. Set `PADDLE_ENVIRONMENT=production`

---

## 6. Integration Testing Checklist

### **Modal AI Tests**

- [ ] Create volume successfully
- [ ] Write files to volume
- [ ] Read files from volume
- [ ] Execute JavaScript code
- [ ] Execute Python code
- [ ] Run test cases (pass/fail correctly)
- [ ] Terminal commands work
- [ ] File tree loads correctly
- [ ] Volume persists across sessions

**Test Command:**
```bash
npm run test:integration:modal
```

---

### **Anthropic Claude Tests**

- [ ] Generate question (EASY difficulty)
- [ ] Generate question (MEDIUM difficulty)
- [ ] Generate question (HARD difficulty)
- [ ] Agent responds to chat messages
- [ ] Agent uses tools (read_file, write_file, run_tests)
- [ ] Security guardrails work (no score leakage)
- [ ] Conversation resets between questions
- [ ] Rate limiting enforced (50 messages/question)

**Test Command:**
```bash
npm run test:integration:claude
```

---

### **Resend Email Tests**

- [ ] Send test email to your address
- [ ] Invitation email received
- [ ] Email HTML renders correctly
- [ ] Plain text fallback works
- [ ] Links in email work
- [ ] Unsubscribe link works
- [ ] Delivery tracking works

**Test Command:**
```bash
npm run test:integration:email
```

---

### **Paddle Payment Tests**

- [ ] Checkout overlay opens
- [ ] Payment succeeds (test card)
- [ ] Webhook received and verified
- [ ] Credits added to organization
- [ ] Invoice generated
- [ ] Payment failure handled
- [ ] Refund processed correctly

**Test Command:**
```bash
npm run test:integration:payments
```

---

## 7. Common Issues & Troubleshooting

### **Modal AI Issues**

**Problem: "Failed to create volume (403 Forbidden)"**
- Check MODAL_TOKEN_ID and MODAL_TOKEN_SECRET
- Verify token has correct permissions
- Check Modal workspace exists

**Problem: "Code execution timeout"**
- Increase MODAL_TIMEOUT in environment
- Check Modal function is deployed
- Verify function is not cold-starting

**Problem: "Volume not found"**
- Verify MODAL_VOLUME_NAMESPACE is correct
- Check volume retention settings
- Recreate volume if expired

---

### **Anthropic Claude Issues**

**Problem: "API key invalid"**
- Verify ANTHROPIC_API_KEY starts with `sk-ant-`
- Check key hasn't been revoked
- Verify billing is active

**Problem: "Rate limit exceeded"**
- Check usage at console.anthropic.com/usage
- Upgrade to higher tier if needed
- Implement request queuing

**Problem: "Questions are low quality"**
- Adjust system prompt in `lib/services/questions.ts`
- Try different Claude model
- Add more context/constraints

---

### **Resend Email Issues**

**Problem: "Domain not verified"**
- Check DNS records are correct (SPF, DKIM, DMARC)
- Wait 10-15 minutes for propagation
- Use `onboarding@resend.dev` for testing

**Problem: "Emails go to spam"**
- Warm up domain (send gradually increasing volume)
- Ensure SPF/DKIM/DMARC are correct
- Add BIMI record
- Check blacklist status

**Problem: "Email rate limit"**
- Upgrade Resend plan
- Implement send queue
- Use batch sending

---

### **Paddle Payment Issues**

**Problem: "Checkout doesn't open"**
- Verify PADDLE_PUBLIC_KEY is correct
- Check Paddle.js is loaded
- Open browser console for errors

**Problem: "Webhook not received"**
- Check webhook URL is accessible publicly
- Verify webhook secret matches
- Check Paddle webhook logs

**Problem: "Payment succeeded but credits not added"**
- Check webhook handler logs
- Verify database transaction succeeded
- Check Paddle event type

---

## 8. Performance Optimization

### **Modal AI Optimization**

- **Cold Start**: Keep volumes warm with cron job
- **Caching**: Cache file system tree (5min TTL)
- **Concurrency**: Limit concurrent sandboxes (10 max)
- **Cleanup**: Delete volumes after 7 days

### **Claude API Optimization**

- **Prompt Caching**: Use Claude's prompt caching feature
- **Model Selection**: Use Haiku for simple tasks, Sonnet for complex
- **Token Limits**: Set appropriate max_tokens per use case
- **Batching**: Batch question generation when possible

### **Database Optimization**

- **Indexes**: Add indexes on frequently queried fields
- **Connection Pooling**: Use Prisma connection pooling
- **Query Optimization**: Use `select` to limit fields returned
- **Caching**: Use Redis for session data

---

## 9. Security Checklist

- [ ] All API keys stored in environment variables (not code)
- [ ] Webhook signatures verified (Paddle)
- [ ] Rate limiting implemented (API routes)
- [ ] Input validation on all endpoints (Zod schemas)
- [ ] SQL injection prevented (Prisma parameterized queries)
- [ ] XSS prevented (React escaping)
- [ ] CSRF protection enabled (Next.js built-in)
- [ ] Secrets rotated regularly (quarterly)
- [ ] Error messages don't leak sensitive info
- [ ] Logs sanitized (no API keys, passwords)

---

## 10. Monitoring Setup

### **Set Up Monitoring**

1. **Sentry** (Error Tracking)
   ```bash
   npm install @sentry/nextjs
   npx @sentry/wizard@latest -i nextjs
   ```

2. **LogRocket** (Session Replay)
   ```bash
   npm install logrocket
   ```

3. **Vercel Analytics** (Performance)
   - Already enabled in Vercel dashboard
   - Check Core Web Vitals

### **Key Metrics to Monitor**

- **Uptime**: 99.9% target
- **Response Time**: <200ms (p95)
- **Error Rate**: <0.5%
- **Modal Sandbox Success Rate**: >98%
- **Claude API Success Rate**: >99%
- **Email Delivery Rate**: >99%
- **Payment Success Rate**: >95%

---

## 11. Launch Day Checklist

### **Pre-Launch (1 Day Before)**

- [ ] All integrations tested end-to-end
- [ ] Production environment variables set
- [ ] Database migrations run
- [ ] DNS records configured
- [ ] SSL certificates valid
- [ ] Monitoring dashboards setup
- [ ] Support email configured
- [ ] Terms of Service, Privacy Policy published
- [ ] Pricing page final
- [ ] Documentation complete

### **Launch Day**

- [ ] Deploy to production (Vercel)
- [ ] Smoke test all critical paths
- [ ] Monitor error rates (first hour)
- [ ] Test payment flow (real transaction)
- [ ] Send test invitation email
- [ ] Check analytics tracking
- [ ] Announce on social media
- [ ] Post on ProductHunt, HN
- [ ] Email beta users

### **Post-Launch (First Week)**

- [ ] Monitor daily error reports
- [ ] Respond to user feedback
- [ ] Fix critical bugs within 24h
- [ ] Track key metrics (signups, assessments, revenue)
- [ ] Gather testimonials
- [ ] Iterate on UX based on feedback

---

## 12. Cost Monitoring

Track these costs weekly:

| Service | Budget | Alert Threshold |
|---------|--------|-----------------|
| Vercel | $20/mo | $30 |
| Database (Neon/Supabase) | $25/mo | $40 |
| Modal AI | $1,000/mo (100 assessments) | $1,500 |
| Anthropic Claude | $300/mo | $500 |
| Resend | $20/mo | $40 |
| Paddle (fees) | 5% + $0.50/transaction | N/A |
| **Total** | **~$1,365/mo** | **$2,110** |

**Break-Even**: 217 assessments/month @ $20 each = $4,340 revenue

---

## Need Help?

**Documentation:**
- Modal: https://modal.com/docs
- Anthropic: https://docs.anthropic.com
- Resend: https://resend.com/docs
- Paddle: https://developer.paddle.com

**Support:**
- Modal: support@modal.com
- Anthropic: support@anthropic.com
- Resend: support@resend.com
- Paddle: support@paddle.com

---

**Next Steps:** Start with Modal AI integration (hardest), then Claude, then Resend, finally Paddle.

Good luck! 🚀
