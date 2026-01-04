import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
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
  adapter: PrismaAdapter(prisma) as Adapter,
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
      if (!user.email) {
        return "/auth/error?error=EmailRequired";
      }

      if (isPersonalEmail(user.email)) {
        return "/auth/error?error=PersonalEmailNotAllowed";
      }

      // Handle B2B signup for OAuth users
      if (account?.provider && account.provider !== "credentials") {
        try {
          const result = await handleB2BSignup({
            userId: user.id!,
            userName: user.name ?? null,
            userEmail: user.email,
          });

          // If user is founder (created new org), send verification email to founder
          if (result.isFounder && result.organization.domain) {
            const domain = result.organization.domain;
            try {
              await sendDomainVerificationEmail({
                to: user.email, // Send to founder, not admin@domain
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
              // Don't block sign-in if email fails
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
            // Personal email or invalid email - redirect to error page
            return `/auth/error?error=${encodeURIComponent(error.message)}`;
          }
          logger.error(
            "[Auth] B2B signup failed",
            error instanceof Error ? error : new Error(String(error))
          );
          // Don't block sign-in for other errors
        }
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
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
  },
});
