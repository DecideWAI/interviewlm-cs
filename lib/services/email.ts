import { Resend } from "resend";
import BRANDING from "@/lib/branding";

// Initialize Resend with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendInvitationEmailParams {
  to: string;
  candidateName: string;
  assessmentTitle: string;
  role: string;
  duration: number;
  invitationLink: string;
  expiresAt: Date;
  customMessage?: string;
  organizationName?: string;
}

/**
 * Send assessment invitation email to candidate
 */
export async function sendInvitationEmail(params: SendInvitationEmailParams) {
  const {
    to,
    candidateName,
    assessmentTitle,
    role,
    duration,
    invitationLink,
    expiresAt,
    customMessage,
    organizationName = BRANDING.name,
  } = params;

  const expiryDate = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const emailHtml = generateInvitationEmailHtml({
    candidateName,
    assessmentTitle,
    role,
    duration,
    invitationLink,
    expiryDate,
    customMessage,
    organizationName,
  });

  const emailText = generateInvitationEmailText({
    candidateName,
    assessmentTitle,
    role,
    duration,
    invitationLink,
    expiryDate,
    customMessage,
    organizationName,
  });

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || BRANDING.defaultEmailFrom,
      to,
      subject: `You're invited to complete an assessment for ${role}`,
      html: emailHtml,
      text: emailText,
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error("Failed to send invitation email:", error);
    throw new Error("Failed to send invitation email");
  }
}

/**
 * Generate HTML email template for invitation
 */
function generateInvitationEmailHtml(params: {
  candidateName: string;
  assessmentTitle: string;
  role: string;
  duration: number;
  invitationLink: string;
  expiryDate: string;
  customMessage?: string;
  organizationName: string;
}): string {
  const {
    candidateName,
    assessmentTitle,
    role,
    duration,
    invitationLink,
    expiryDate,
    customMessage,
    organizationName,
  } = params;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Assessment Invitation</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #000000;
      color: #ffffff;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #5E6AD2;
      margin-bottom: 8px;
    }
    .card {
      background: #0A0A0A;
      border: 1px solid #1A1A1A;
      border-radius: 8px;
      padding: 32px;
      margin-bottom: 24px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #ffffff;
    }
    .message {
      font-size: 14px;
      line-height: 1.6;
      color: #9CA3AF;
      margin-bottom: 24px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #1A1A1A;
    }
    .info-label {
      color: #6B7280;
      font-size: 14px;
    }
    .info-value {
      color: #ffffff;
      font-size: 14px;
      font-weight: 500;
    }
    .cta-button {
      display: inline-block;
      background: #5E6AD2;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 16px;
      text-align: center;
      margin: 24px 0;
      transition: background 0.2s;
    }
    .cta-button:hover {
      background: #6B77E1;
    }
    .link-text {
      font-size: 12px;
      color: #6B7280;
      margin-top: 16px;
      word-break: break-all;
    }
    .custom-message {
      background: #121212;
      border-left: 3px solid #5E6AD2;
      padding: 16px;
      margin: 24px 0;
      font-size: 14px;
      line-height: 1.6;
      color: #9CA3AF;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid #1A1A1A;
      color: #6B7280;
      font-size: 12px;
    }
    .expiry-notice {
      background: #1A1A1A;
      border: 1px solid #2A2A2A;
      border-radius: 6px;
      padding: 12px;
      margin-top: 24px;
      font-size: 13px;
      color: #9CA3AF;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${BRANDING.emailLogoText}</div>
      <p style="color: #6B7280; font-size: 14px;">${BRANDING.tagline}</p>
    </div>

    <div class="card">
      <div class="greeting">Hi ${candidateName},</div>

      <div class="message">
        You've been invited by ${organizationName} to complete a technical assessment for the <strong style="color: #ffffff;">${role}</strong> position.
      </div>

      ${
        customMessage
          ? `<div class="custom-message">${customMessage}</div>`
          : ""
      }

      <div class="message">
        This assessment will evaluate your ability to solve real-world coding problems using modern AI tools like Claude Code. You'll work in a realistic development environment with access to an AI assistant.
      </div>

      <div style="margin: 24px 0;">
        <div class="info-row">
          <span class="info-label">Assessment</span>
          <span class="info-value">${assessmentTitle}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Duration</span>
          <span class="info-value">${duration} minutes</span>
        </div>
        <div class="info-row" style="border-bottom: none;">
          <span class="info-label">Expires</span>
          <span class="info-value">${expiryDate}</span>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${invitationLink}" class="cta-button">Start Assessment</a>
      </div>

      <div class="expiry-notice">
        ⏰ This invitation expires on ${expiryDate}. Please complete the assessment before this date.
      </div>

      <div class="link-text">
        Or copy and paste this link into your browser:<br>
        ${invitationLink}
      </div>
    </div>

    <div class="footer">
      <p>If you have any questions, please contact ${organizationName}.</p>
      <p style="margin-top: 16px;">
        Powered by <strong style="color: #5E6AD2;">${BRANDING.name}</strong><br>
        ${BRANDING.emailFooterText}
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email for invitation (fallback)
 */
function generateInvitationEmailText(params: {
  candidateName: string;
  assessmentTitle: string;
  role: string;
  duration: number;
  invitationLink: string;
  expiryDate: string;
  customMessage?: string;
  organizationName: string;
}): string {
  const {
    candidateName,
    assessmentTitle,
    role,
    duration,
    invitationLink,
    expiryDate,
    customMessage,
    organizationName,
  } = params;

  return `
Hi ${candidateName},

You've been invited by ${organizationName} to complete a technical assessment for the ${role} position.

${customMessage ? `Message from ${organizationName}:\n${customMessage}\n` : ""}
This assessment will evaluate your ability to solve real-world coding problems using modern AI tools like Claude Code. You'll work in a realistic development environment with access to an AI assistant.

Assessment Details:
- Assessment: ${assessmentTitle}
- Duration: ${duration} minutes
- Expires: ${expiryDate}

To start your assessment, click the link below or copy it into your browser:
${invitationLink}

⏰ This invitation expires on ${expiryDate}. Please complete the assessment before this date.

If you have any questions, please contact ${organizationName}.

---
Powered by ${BRANDING.name}
${BRANDING.emailFooterText}
  `.trim();
}

/**
 * Send interview completion notification to hiring team
 */
export async function sendCompletionNotification(params: {
  to: string;
  candidateName: string;
  assessmentTitle: string;
  completedAt: Date;
  duration: number; // seconds
  dashboardUrl: string;
  organizationName?: string;
}) {
  const {
    to,
    candidateName,
    assessmentTitle,
    completedAt,
    duration,
    dashboardUrl,
    organizationName = BRANDING.name,
  } = params;

  const durationMinutes = Math.round(duration / 60);
  const completedAtFormatted = completedAt.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Completed</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; color: #ffffff; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 24px; font-weight: bold; color: #5E6AD2; margin-bottom: 8px; }
    .card { background: #0A0A0A; border: 1px solid #1A1A1A; border-radius: 8px; padding: 32px; }
    .title { font-size: 24px; font-weight: 600; margin-bottom: 16px; color: #ffffff; }
    .message { font-size: 14px; line-height: 1.6; color: #9CA3AF; margin-bottom: 24px; }
    .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #1A1A1A; }
    .info-label { color: #6B7280; font-size: 14px; }
    .info-value { color: #ffffff; font-size: 14px; font-weight: 500; }
    .cta-button { display: inline-block; background: #5E6AD2; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500; font-size: 16px; margin: 24px 0; }
    .cta-button:hover { background: #6B77E1; }
    .footer { text-align: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid #1A1A1A; color: #6B7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${BRANDING.emailLogoText}</div>
      <p style="color: #6B7280; font-size: 14px;">${BRANDING.tagline}</p>
    </div>
    <div class="card">
      <div class="title">Interview Completed</div>
      <div class="message">${candidateName} has completed the ${assessmentTitle} assessment.</div>
      <div style="margin: 24px 0;">
        <div class="info-row">
          <span class="info-label">Candidate</span>
          <span class="info-value">${candidateName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Completed</span>
          <span class="info-value">${completedAtFormatted}</span>
        </div>
        <div class="info-row" style="border-bottom: none;">
          <span class="info-label">Duration</span>
          <span class="info-value">${durationMinutes} minutes</span>
        </div>
      </div>
      <div class="message">View the full interview recording, code snapshots, and detailed evaluation in your dashboard.</div>
      <div style="text-align: center;">
        <a href="${dashboardUrl}" class="cta-button">View Results</a>
      </div>
    </div>
    <div class="footer">
      <p>Powered by <strong style="color: #5E6AD2;">${BRANDING.name}</strong><br>${BRANDING.emailFooterText}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const emailText = `
Interview Completed

${candidateName} has completed the ${assessmentTitle} assessment.

Details:
- Candidate: ${candidateName}
- Completed: ${completedAtFormatted}
- Duration: ${durationMinutes} minutes

View the full results: ${dashboardUrl}

---
Powered by ${BRANDING.name}
${BRANDING.emailFooterText}
  `.trim();

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || BRANDING.defaultEmailFrom,
      to,
      subject: `${candidateName} completed ${assessmentTitle}`,
      html: emailHtml,
      text: emailText,
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error("Failed to send completion notification:", error);
    throw new Error("Failed to send completion notification");
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(params: {
  to: string;
  userName: string;
  resetUrl: string;
  expiresAt: Date;
}) {
  const { to, userName, resetUrl, expiresAt } = params;

  const expiresAtFormatted = expiresAt.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; color: #ffffff; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 24px; font-weight: bold; color: #5E6AD2; margin-bottom: 8px; }
    .card { background: #0A0A0A; border: 1px solid #1A1A1A; border-radius: 8px; padding: 32px; }
    .title { font-size: 24px; font-weight: 600; margin-bottom: 16px; color: #ffffff; }
    .message { font-size: 14px; line-height: 1.6; color: #9CA3AF; margin-bottom: 24px; }
    .cta-button { display: inline-block; background: #5E6AD2; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500; font-size: 16px; margin: 24px 0; }
    .cta-button:hover { background: #6B77E1; }
    .warning { background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 6px; padding: 12px; margin-top: 24px; font-size: 13px; color: #9CA3AF; }
    .footer { text-align: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid #1A1A1A; color: #6B7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${BRANDING.emailLogoText}</div>
      <p style="color: #6B7280; font-size: 14px;">${BRANDING.tagline}</p>
    </div>
    <div class="card">
      <div class="title">Reset Your Password</div>
      <div class="message">Hi ${userName},</div>
      <div class="message">We received a request to reset your password for your ${BRANDING.name} account.</div>
      <div style="text-align: center;">
        <a href="${resetUrl}" class="cta-button">Reset Password</a>
      </div>
      <div class="warning">This link will expire at ${expiresAtFormatted}. If you didn't request this password reset, you can safely ignore this email.</div>
      <div class="message" style="font-size: 12px; margin-top: 16px;">
        Or copy and paste this link into your browser:<br>${resetUrl}
      </div>
    </div>
    <div class="footer">
      <p>Powered by <strong style="color: #5E6AD2;">${BRANDING.name}</strong><br>${BRANDING.emailFooterText}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const emailText = `
Reset Your Password

Hi ${userName},

We received a request to reset your password for your ${BRANDING.name} account.

Reset your password: ${resetUrl}

This link will expire at ${expiresAtFormatted}. If you didn't request this password reset, you can safely ignore this email.

---
Powered by ${BRANDING.name}
${BRANDING.emailFooterText}
  `.trim();

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || BRANDING.defaultEmailFrom,
      to,
      subject: `Reset your ${BRANDING.name} password`,
      html: emailHtml,
      text: emailText,
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}

/**
 * Test email connection
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[Email] RESEND_API_KEY not configured');
      return false;
    }
    console.log('[Email] Connection OK');
    return true;
  } catch (error) {
    console.error('[Email] Connection test failed:', error);
    return false;
  }
}

/**
 * Send email verification email
 */
export async function sendEmailVerification(params: {
  to: string;
  userName: string;
  verificationUrl: string;
  expiresAt: Date;
}) {
  const { to, userName, verificationUrl, expiresAt } = params;

  const expiresAtFormatted = expiresAt.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; color: #ffffff; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 24px; font-weight: bold; color: #5E6AD2; margin-bottom: 8px; }
    .card { background: #0A0A0A; border: 1px solid #1A1A1A; border-radius: 8px; padding: 32px; }
    .title { font-size: 24px; font-weight: 600; margin-bottom: 16px; color: #ffffff; }
    .message { font-size: 14px; line-height: 1.6; color: #9CA3AF; margin-bottom: 24px; }
    .cta-button { display: inline-block; background: #5E6AD2; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500; font-size: 16px; margin: 24px 0; }
    .cta-button:hover { background: #6B77E1; }
    .warning { background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 6px; padding: 12px; margin-top: 24px; font-size: 13px; color: #9CA3AF; }
    .footer { text-align: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid #1A1A1A; color: #6B7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${BRANDING.emailLogoText}</div>
      <p style="color: #6B7280; font-size: 14px;">${BRANDING.tagline}</p>
    </div>
    <div class="card">
      <div class="title">Verify Your Email Address</div>
      <div class="message">Hi ${userName},</div>
      <div class="message">Thanks for signing up for ${BRANDING.name}! Please verify your email address to get started.</div>
      <div style="text-align: center;">
        <a href="${verificationUrl}" class="cta-button">Verify Email Address</a>
      </div>
      <div class="warning">This link will expire on ${expiresAtFormatted}. If you didn't create an account, you can safely ignore this email.</div>
      <div class="message" style="font-size: 12px; margin-top: 16px;">
        Or copy and paste this link into your browser:<br>${verificationUrl}
      </div>
    </div>
    <div class="footer">
      <p>Powered by <strong style="color: #5E6AD2;">${BRANDING.name}</strong><br>${BRANDING.emailFooterText}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const emailText = `
Verify Your Email Address

Hi ${userName},

Thanks for signing up for ${BRANDING.name}! Please verify your email address to get started.

Verify your email: ${verificationUrl}

This link will expire on ${expiresAtFormatted}. If you didn't create an account, you can safely ignore this email.

---
Powered by ${BRANDING.name}
${BRANDING.emailFooterText}
  `.trim();

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || BRANDING.defaultEmailFrom,
      to,
      subject: `Verify your ${BRANDING.name} email address`,
      html: emailHtml,
      text: emailText,
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error("Failed to send email verification:", error);
    throw new Error("Failed to send email verification");
  }
}

export const emailService = {
  sendInvitationEmail,
  sendCompletionNotification,
  sendPasswordReset,
  sendEmailVerification,
  testEmailConnection,
};
