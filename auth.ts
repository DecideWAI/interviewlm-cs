import NextAuth from "next-auth";
import { createSecureAdapter } from "@/lib/auth/adapter";
import prisma from "@/lib/prisma";
import authConfig from "./auth.config";
import { handleB2BSignup } from "@/lib/services/organization";
import { isPersonalEmail } from "@/lib/constants/blocked-domains";
import { ValidationError } from "@/lib/utils/errors";
import { sendDomainVerificationEmail } from "@/lib/services/email";
import { logger } from "@/lib/utils/logger";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: createSecureAdapter(prisma),
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  ...authConfig,
  callbacks: {
    async signIn({ user, account }) {
      // Skip for credentials - handled in /api/auth/register
      if (account?.provider === "credentials") {
        return true;
      }

      // Block personal emails for OAuth sign-ins
      // Note: B2B signup moved to jwt callback (runs after user is persisted)
      if (!user.email) {
        return "/auth/error?error=EmailRequired";
      }

      if (isPersonalEmail(user.email)) {
        return "/auth/error?error=PersonalEmailNotAllowed";
      }

      return true; // Allow sign-in to proceed
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as string;
      }
      return session;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.role = user.role;

        // Handle B2B signup for OAuth users on first sign-in
        // This runs AFTER user is persisted to database (unlike signIn callback)
        if (account?.provider && account.provider !== "credentials" && user.email) {
          try {
            const result = await handleB2BSignup({
              userId: user.id!,
              userName: user.name ?? null,
              userEmail: user.email,
            });

            // If user is founder (created new org), send verification email
            if (result.isFounder && result.organization.domain) {
              const domain = result.organization.domain;
              try {
                await sendDomainVerificationEmail({
                  to: user.email,
                  organizationName: result.organization.name,
                  domain,
                  founderEmail: user.email,
                  founderName: user.name || null,
                });
                logger.info("[Auth] Domain verification email sent", {
                  recipient: user.email,
                  domain,
                });
              } catch (emailError) {
                logger.error(
                  "[Auth] Failed to send domain verification email",
                  emailError instanceof Error ? emailError : new Error(String(emailError)),
                  { domain }
                );
              }
            }

            logger.info("[Auth] B2B signup completed", {
              userId: user.id,
              organizationId: result.organization.id,
              isFounder: result.isFounder,
              domain: result.organization.domain,
            });
          } catch (error) {
            if (error instanceof ValidationError) {
              logger.warn("[Auth] B2B signup validation error", { error: error.message });
            } else {
              logger.error(
                "[Auth] B2B signup failed",
                error instanceof Error ? error : new Error(String(error))
              );
            }
            // Don't block JWT creation - user can still sign in
          }
        }
      }
      return token;
    },
  },
});
