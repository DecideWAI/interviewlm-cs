/**
 * Application branding configuration
 * Centralized branding constants for consistency across the application
 */

export const BRANDING = {
  // Company name
  name: "InterviewLM",

  // Tagline
  tagline: "AI-Native Technical Assessments",

  // Default email sender
  defaultEmailFrom: "InterviewLM <noreply@interviewlm.com>",

  // URLs
  website: "https://interviewlm.com",

  // Email branding
  emailLogoText: "InterviewLM",
  emailFooterText: "The AI-native technical assessment platform",
} as const;

export default BRANDING;
