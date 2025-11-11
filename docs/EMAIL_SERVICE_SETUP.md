# Email Service Setup Guide

## Overview

InterviewLM uses **Resend** (https://resend.com) for sending transactional emails to candidates. This guide explains how to configure the email service for production use.

## Features

- **Candidate Invitations**: Automatically send professional email invitations when candidates are invited to assessments
- **Branded Templates**: Linear-inspired pitch-black design matching the InterviewLM platform
- **Invitation Links**: Unique, secure links with tokens for each candidate
- **Custom Messages**: Recruiters can include personalized messages in invitations
- **Deadline Management**: Configurable expiration dates (default: 30 days)
- **Bulk Invitations**: Send invitations to multiple candidates at once

## Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Resend API Key (required)
# Get this from: https://resend.com/api-keys
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# From Email Address (optional, defaults to noreply@interviewlm.com)
# Must be a verified domain in Resend
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Application URL (required for invitation links)
NEXT_PUBLIC_URL=https://yourdomain.com
```

## Setup Steps

### 1. Create a Resend Account

1. Go to [https://resend.com](https://resend.com)
2. Sign up for a free account
3. Verify your email address

### 2. Add and Verify Your Domain

1. In the Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Add the provided DNS records to your domain provider:
   - **SPF Record** (TXT): Prevents email spoofing
   - **DKIM Record** (TXT): Email authentication
   - **DMARC Record** (TXT): Email policy
5. Wait for DNS propagation (usually 5-60 minutes)
6. Verify the domain in Resend

**Note**: For testing, you can use Resend's sandbox mode which allows sending to verified email addresses without domain verification.

### 3. Create an API Key

1. In the Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Give it a name (e.g., "InterviewLM Production")
4. Select appropriate permissions:
   - ✅ **Emails: Send** (required)
   - Optional: **Emails: Read** (for debugging)
5. Copy the API key (starts with `re_`)
6. Add it to your `.env` file as `RESEND_API_KEY`

### 4. Configure Environment Variables

Create or update your `.env` file:

```bash
# Required
RESEND_API_KEY=re_your_actual_api_key_here
NEXT_PUBLIC_URL=https://your-production-domain.com

# Optional (if not using default)
RESEND_FROM_EMAIL=noreply@your-verified-domain.com
```

### 5. Test the Integration

1. Start your application
2. Log in to the dashboard
3. Create a test assessment
4. Click **Invite Candidates**
5. Enter your own email address
6. Check your inbox for the invitation email

## Email Template

The invitation email includes:

- **Branded Header**: InterviewLM logo and tagline
- **Personalized Greeting**: Candidate's name
- **Assessment Details**: Role, duration, expiration date
- **Custom Message**: Optional personalized note from recruiter
- **Clear CTA**: "Start Assessment" button
- **Security**: Unique invitation link with token
- **Expiration Notice**: Deadline reminder
- **Mobile-Friendly**: Responsive design

## Pricing

Resend pricing (as of 2025):

- **Free Tier**: 100 emails/day, 3,000 emails/month
- **Pro Plan**: $20/month for 50,000 emails/month
- **Enterprise**: Custom pricing for higher volumes

For most use cases, the **Free Tier** should be sufficient for early development and testing.

## API Rate Limits

- **Free Tier**: 100 emails/day
- **Pro Tier**: 50,000 emails/month
- **Burst Rate**: Up to 10 emails/second

The invitation API includes error handling and will gracefully fail if rate limits are exceeded (candidates are still created in the database).

## Troubleshooting

### Email Not Sending

1. **Check API Key**: Ensure `RESEND_API_KEY` is set correctly
2. **Verify Domain**: Confirm your domain is verified in Resend
3. **Check Logs**: Look for errors in server console
4. **Rate Limits**: Check if you've exceeded daily/monthly limits
5. **From Address**: Ensure `RESEND_FROM_EMAIL` uses a verified domain

### Email Going to Spam

1. **SPF/DKIM/DMARC**: Ensure all DNS records are configured
2. **From Address**: Use a real, verified domain (not a free provider)
3. **Content**: Avoid spam trigger words
4. **Warm Up**: Gradually increase sending volume
5. **Reputation**: Monitor sender reputation in Resend dashboard

### Domain Verification Issues

1. **DNS Propagation**: Wait up to 24-48 hours
2. **Correct Records**: Double-check DNS record values
3. **TTL**: Set TTL to 3600 (1 hour) for faster updates
4. **Subdomain**: Consider using a subdomain (e.g., `mail.yourdomain.com`)

## Alternative: Sandbox Mode (Development Only)

For development/testing without domain verification:

1. In Resend dashboard, add your personal email to **Verified Addresses**
2. Use that email for testing invitations
3. Emails will only be sent to verified addresses
4. Not suitable for production use

## Security Considerations

- **API Key**: Keep `RESEND_API_KEY` secret - never commit to git
- **Rate Limiting**: Implement application-level rate limiting for bulk invites
- **Token Expiration**: Invitation tokens expire after 30 days (configurable)
- **Unique Tokens**: Each invitation uses a unique token (crypto.randomBytes)

## Monitoring

Monitor email delivery in the Resend dashboard:

- **Delivery Rate**: Track successful deliveries
- **Bounce Rate**: Monitor hard bounces (invalid addresses)
- **Open Rate**: See how many candidates open emails
- **Click Rate**: Track invitation link clicks

## Support

- **Resend Documentation**: https://resend.com/docs
- **Resend Support**: support@resend.com
- **InterviewLM Issues**: [Your support channel]

## Future Enhancements

Potential future email features:

- [ ] Reminder emails for pending assessments
- [ ] Completion confirmation emails
- [ ] Assessment results to candidates
- [ ] Weekly digest for recruiters
- [ ] Email templates customization UI
- [ ] Multi-language support
- [ ] Email analytics dashboard
