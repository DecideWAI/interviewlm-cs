# Inviting Candidates to Assessments

## Overview

The Invite Candidate feature allows you to send email invitations to candidates for published assessments.

## Requirements

### Assessment Must Be Published

**IMPORTANT**: Before you can invite candidates to an assessment, the assessment **must be in PUBLISHED status**.

- Draft assessments cannot accept candidates
- This ensures that the assessment is complete and ready for candidates to take
- You can publish an assessment from the assessment detail page

### How to Invite Candidates

1. **Navigate to the Assessment**
   - Go to Assessments page
   - Click on the assessment you want to invite candidates to

2. **Verify Assessment is Published**
   - Check the status badge on the assessment detail page
   - If it shows "DRAFT", click "Publish" to make it live

3. **Click "Invite Candidates" Button**
   - This opens the invitation dialog

4. **Fill in Candidate Information**
   - **Name**: Candidate's full name (required)
   - **Email**: Valid email address (required)
   - **Phone**: Optional phone number
   - **Custom Message**: Optional personal message to include in the email
   - **Deadline**: Optional deadline (defaults to 30 days)

5. **Bulk Invitations**
   - Click "+ Add Another" to invite multiple candidates at once
   - All candidates in a bulk invitation share the same custom message and deadline
   - Individual candidate details (name, email, phone) are per-candidate

## API Endpoint

```typescript
POST /api/assessments/[id]/candidates

// Single candidate
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1 (555) 123-4567", // optional
  "message": "Looking forward to your assessment!", // optional
  "deadline": "2025-02-15T23:59:59Z" // optional
}

// Bulk invite
{
  "candidates": [
    { "name": "John Doe", "email": "john@example.com" },
    { "name": "Jane Smith", "email": "jane@example.com" }
  ],
  "message": "Looking forward to your assessments!", // optional
  "deadline": "2025-02-15T23:59:59Z" // optional
}
```

## Response

```typescript
{
  "success": true,
  "invited": [
    {
      "id": "candidate_id",
      "name": "John Doe",
      "email": "john@example.com",
      "status": "INVITED",
      "invitedAt": "2025-01-13T...",
      "invitationLink": "https://interviewlm.com/interview/start/..."
    }
  ],
  "errors": [], // Any failures
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  }
}
```

## Error Handling

### Common Errors

1. **Assessment not found (404)**
   - The assessment ID doesn't exist

2. **Assessment must be published (400)**
   - The assessment is still in DRAFT status
   - **Solution**: Publish the assessment first

3. **Already invited to this assessment (included in errors array)**
   - A candidate with this email was already invited
   - The system prevents duplicate invitations to the same assessment

4. **Unauthorized (401)**
   - You're not logged in
   - **Solution**: Sign in first

5. **Forbidden (403)**
   - You don't have access to this assessment
   - The assessment belongs to a different organization

## Invitation Email

When a candidate is invited, they receive an email containing:
- Assessment title and description
- Role and duration information
- Personalized invitation link (unique token)
- Expiration date
- Custom message (if provided)
- Organization name

## Best Practices

1. **Publish Before Inviting**
   - Always publish your assessment before inviting candidates
   - Review the assessment thoroughly in preview mode first

2. **Test with Preview Mode**
   - Use the "Preview" feature to test the assessment yourself
   - Ensure all questions, tech stack requirements, and test cases work correctly

3. **Personalize Messages**
   - Add a custom message to make invitations more personal
   - Explain what the role is about and why they're a good fit

4. **Set Reasonable Deadlines**
   - Default is 30 days, which is usually sufficient
   - Consider the complexity of the assessment when setting deadlines
   - Senior assessments may need more time than junior ones

5. **Bulk Invitations**
   - Use bulk invitations when you have multiple candidates for the same role
   - Keep batches under 50 candidates for better deliverability
   - Monitor the response for any failed invitations

## Tracking Invitations

Once invited, candidates appear in:
- **Assessment Detail Page**: Shows all candidates for this assessment
- **Candidates Page**: Global view of all candidates across all assessments

You can track:
- Invitation sent date
- Assessment started date
- Completion status
- Overall scores
- Individual metrics (AI collaboration, code quality, etc.)

## Resending Invitations

To resend an invitation:
- The candidate must not have started the assessment yet
- Delete the candidate from the assessment
- Re-invite them with the same email
- They will receive a new invitation link

## Security

- Each invitation link contains a unique, cryptographically random token
- Tokens are single-use and tied to a specific candidate and assessment
- Links expire after the deadline (default 30 days)
- Candidates cannot access assessments without a valid invitation link
