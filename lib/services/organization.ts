/**
 * Organization Service
 *
 * Handles B2B domain-based organization creation and management.
 * - First user from a domain creates the organization (founder)
 * - Subsequent users from the same domain auto-join as members
 * - Personal emails are blocked
 * - Domain verification via email to admin@domain.com
 */

import prisma from "@/lib/prisma";
import { logger } from "@/lib/utils/logger";
import { ValidationError } from "@/lib/utils/errors";
import crypto from "crypto";
import {
  isPersonalEmail,
  extractDomain,
  deriveOrgNameFromDomain,
} from "@/lib/constants/blocked-domains";

export interface HandleB2BSignupParams {
  userId: string;
  userName: string | null;
  userEmail: string;
}

export interface B2BSignupResult {
  organization: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    domainVerified: boolean;
    plan: string;
    credits: number;
  };
  isFounder: boolean;
  joinMethod: "founder" | "domain-auto-join";
}

/**
 * Generates a unique slug for an organization from a domain.
 * Handles collisions by appending numeric suffixes.
 * @throws Error if unable to generate unique slug after max attempts
 */
async function generateUniqueSlug(domain: string): Promise<string> {
  const baseSlug = domain
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-");

  let slug = baseSlug;
  let slugSuffix = 1;
  const maxAttempts = 100;
  let attempts = 0;

  // Keep trying until we find a unique slug, but avoid infinite loops
  while (
    attempts < maxAttempts &&
    (await prisma.organization.findUnique({ where: { slug } }))
  ) {
    slug = `${baseSlug}-${slugSuffix}`;
    slugSuffix++;
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error(
      `Failed to generate unique organization slug after ${maxAttempts} attempts.`
    );
  }

  return slug;
}

/**
 * Generates a secure verification token for domain verification.
 */
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Handles B2B signup for a user.
 *
 * Flow:
 * 1. Block personal emails (gmail, outlook, etc.)
 * 2. Check if organization exists for this domain
 * 3. If yes: auto-join user as MEMBER
 * 4. If no: create organization with user as OWNER (founder)
 *
 * @param params - User information
 * @returns Organization info and whether user is founder
 * @throws ValidationError if personal email is used
 */
export async function handleB2BSignup(
  params: HandleB2BSignupParams
): Promise<B2BSignupResult> {
  // Note: userName is available from params but currently not used in org creation
  // Organization names are derived from domain instead
  const { userId, userEmail } = params;

  // 1. Block personal emails
  if (isPersonalEmail(userEmail)) {
    logger.warn("[OrgService] Personal email blocked", { userEmail });
    throw new ValidationError(
      "Personal email addresses are not allowed. Please use your company email."
    );
  }

  const domain = extractDomain(userEmail);
  if (!domain) {
    throw new ValidationError("Invalid email address format.");
  }

  // 2. Check if user already has an organization membership
  const existingMembership = await prisma.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });

  if (existingMembership) {
    logger.debug("[OrgService] User already has organization", {
      userId,
      organizationId: existingMembership.organizationId,
    });

    // Validate joinMethod - only accept known values, default to "founder" for legacy data
    const validJoinMethods = ["founder", "domain-auto-join"] as const;
    const joinMethod = validJoinMethods.includes(
      existingMembership.joinMethod as typeof validJoinMethods[number]
    )
      ? (existingMembership.joinMethod as "founder" | "domain-auto-join")
      : "founder";

    return {
      organization: {
        id: existingMembership.organization.id,
        name: existingMembership.organization.name,
        slug: existingMembership.organization.slug,
        domain: existingMembership.organization.domain,
        domainVerified: existingMembership.organization.domainVerified,
        plan: existingMembership.organization.plan,
        credits: existingMembership.organization.credits,
      },
      isFounder: joinMethod === "founder",
      joinMethod,
    };
  }

  // 3. Check if organization exists for this domain
  const existingOrg = await prisma.organization.findUnique({
    where: { domain },
  });

  if (existingOrg) {
    // Auto-join existing organization as MEMBER
    await prisma.organizationMember.create({
      data: {
        organizationId: existingOrg.id,
        userId,
        role: "MEMBER",
        joinMethod: "domain-auto-join",
        joinedAt: new Date(),
      },
    });

    logger.info("[OrgService] User auto-joined organization via domain", {
      userId,
      organizationId: existingOrg.id,
      domain,
    });

    return {
      organization: {
        id: existingOrg.id,
        name: existingOrg.name,
        slug: existingOrg.slug,
        domain: existingOrg.domain,
        domainVerified: existingOrg.domainVerified,
        plan: existingOrg.plan,
        credits: existingOrg.credits,
      },
      isFounder: false,
      joinMethod: "domain-auto-join",
    };
  }

  // 4. Create new organization (user is founder)
  // Use a transaction to prevent race conditions when two users from the same
  // domain sign up simultaneously. The unique constraint on domain will cause
  // the second transaction to fail, which we handle by retrying the join flow.
  try {
    const orgName = deriveOrgNameFromDomain(domain);
    const slug = await generateUniqueSlug(domain);
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const organization = await prisma.$transaction(async (tx) => {
      // Double-check within transaction that org doesn't exist
      const existingInTx = await tx.organization.findUnique({
        where: { domain },
      });

      if (existingInTx) {
        // Another user created the org - join as member instead
        await tx.organizationMember.create({
          data: {
            organizationId: existingInTx.id,
            userId,
            role: "MEMBER",
            joinMethod: "domain-auto-join",
            joinedAt: new Date(),
          },
        });
        return { ...existingInTx, wasCreated: false };
      }

      // Create the organization
      const newOrg = await tx.organization.create({
        data: {
          name: orgName,
          slug,
          domain,
          domainVerified: false,
          domainVerificationToken: verificationToken,
          domainVerificationExpiresAt: verificationExpires,
          autoJoinEnabled: false,
          plan: "FREE",
          credits: 3, // Free trial credits
          members: {
            create: {
              userId,
              role: "OWNER",
              joinMethod: "founder",
              joinedAt: new Date(),
            },
          },
        },
      });
      return { ...newOrg, wasCreated: true };
    });

    const isFounder = organization.wasCreated;

    if (isFounder) {
      logger.info("[OrgService] Created organization for B2B founder", {
        userId,
        organizationId: organization.id,
        domain,
        orgName,
      });
    } else {
      logger.info("[OrgService] User joined existing organization (race condition handled)", {
        userId,
        organizationId: organization.id,
        domain,
      });
    }

    // Note: Domain verification email should be sent by the caller
    // (auth.ts or register route) using sendDomainVerificationEmail()

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        domain: organization.domain,
        domainVerified: organization.domainVerified,
        plan: organization.plan,
        credits: organization.credits,
      },
      isFounder,
      joinMethod: isFounder ? "founder" : "domain-auto-join",
    };
  } catch (error) {
    // Handle unique constraint violation (P2002) - another user created the org
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      logger.info("[OrgService] Race condition detected, retrying join flow", {
        userId,
        domain,
      });

      // Retry: org was created by another user, join it
      const createdOrg = await prisma.organization.findUnique({
        where: { domain },
      });

      if (createdOrg) {
        await prisma.organizationMember.create({
          data: {
            organizationId: createdOrg.id,
            userId,
            role: "MEMBER",
            joinMethod: "domain-auto-join",
            joinedAt: new Date(),
          },
        });

        return {
          organization: {
            id: createdOrg.id,
            name: createdOrg.name,
            slug: createdOrg.slug,
            domain: createdOrg.domain,
            domainVerified: createdOrg.domainVerified,
            plan: createdOrg.plan,
            credits: createdOrg.credits,
          },
          isFounder: false,
          joinMethod: "domain-auto-join",
        };
      }
    }
    throw error;
  }
}

/**
 * Get the domain verification token for an organization.
 * Used to resend verification emails.
 */
export async function getOrganizationVerificationInfo(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      domain: true,
      domainVerified: true,
      domainVerificationToken: true,
      domainVerificationExpiresAt: true,
    },
  });

  return org;
}

/**
 * Regenerate domain verification token for an organization.
 * Called when resending verification email.
 */
export async function regenerateVerificationToken(
  organizationId: string
): Promise<string> {
  const newToken = generateVerificationToken();
  const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      domainVerificationToken: newToken,
      domainVerificationExpiresAt: newExpires,
    },
  });

  logger.info("[OrgService] Regenerated verification token", { organizationId });

  return newToken;
}

/**
 * Verify a domain using a verification token.
 * Called when admin clicks verification link.
 */
export async function verifyDomain(token: string): Promise<{
  success: boolean;
  organizationId?: string;
  error?: string;
}> {
  const org = await prisma.organization.findUnique({
    where: { domainVerificationToken: token },
  });

  if (!org) {
    return { success: false, error: "Invalid verification token." };
  }

  if (
    org.domainVerificationExpiresAt &&
    org.domainVerificationExpiresAt < new Date()
  ) {
    return { success: false, error: "Verification token has expired." };
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      domainVerified: true,
      autoJoinEnabled: true,
      domainVerificationToken: null,
      domainVerificationExpiresAt: null,
    },
  });

  logger.info("[OrgService] Domain verified", {
    organizationId: org.id,
    domain: org.domain,
  });

  return { success: true, organizationId: org.id };
}

// Legacy function - kept for backwards compatibility during migration
// TODO: Remove after B2B migration is complete
export interface EnsureUserHasOrganizationParams {
  userId: string;
  userName: string | null;
  userEmail: string;
}

export interface OrganizationResult {
  id: string;
  name: string;
  slug: string;
  plan: string;
  credits: number;
}

/**
 * @deprecated Use handleB2BSignup instead. This function will be removed.
 */
export async function ensureUserHasOrganization(
  params: EnsureUserHasOrganizationParams
): Promise<OrganizationResult> {
  const result = await handleB2BSignup(params);
  return {
    id: result.organization.id,
    name: result.organization.name,
    slug: result.organization.slug,
    plan: result.organization.plan,
    credits: result.organization.credits,
  };
}
