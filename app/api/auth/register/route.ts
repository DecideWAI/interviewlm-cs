import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import {
  sendEmailVerification,
  sendDomainVerificationEmail,
} from "@/lib/services/email";
import { redisRegistrationRateLimit } from "@/lib/middleware/redis-rate-limit";
import { authTurnstileVerifier } from "@/lib/middleware/turnstile";
import { isPersonalEmail } from "@/lib/constants/blocked-domains";
import { handleB2BSignup } from "@/lib/services/organization";
import { ValidationError } from "@/lib/utils/errors";

export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting first
    const rateLimited = await redisRegistrationRateLimit(req);
    if (rateLimited) return rateLimited;

    const body = await req.json();
    const { name, email, password } = body;

    // Verify Turnstile token
    const turnstileResult = await authTurnstileVerifier(req, body);
    if (turnstileResult) return turnstileResult;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Block personal emails (B2B only)
    if (isPersonalEmail(email)) {
      return NextResponse.json(
        {
          error:
            "Personal email addresses are not allowed. Please use your company email.",
        },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Create user first (without organization - B2B flow handles this)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        // emailVerified will be null until verified
      },
    });

    // Handle B2B organization creation/joining
    let b2bResult;
    try {
      b2bResult = await handleB2BSignup({
        userId: user.id,
        userName: name ?? null,
        userEmail: email,
      });

      // If user is founder (created new org), send domain verification email
      if (b2bResult.isFounder && b2bResult.organization.domain) {
        const domain = b2bResult.organization.domain;
        try {
          await sendDomainVerificationEmail({
            to: `admin@${domain}`,
            organizationName: b2bResult.organization.name,
            domain,
            founderEmail: email,
            founderName: name || null,
          });
          console.log(
            `[Register] Domain verification email sent to admin@${domain}`
          );
        } catch (emailError) {
          // Don't fail registration if domain verification email fails
          console.error(
            "[Register] Failed to send domain verification email:",
            emailError
          );
        }
      }

      console.log("[Register] B2B signup completed", {
        userId: user.id,
        organizationId: b2bResult.organization.id,
        isFounder: b2bResult.isFounder,
        joinMethod: b2bResult.joinMethod,
      });
    } catch (b2bError) {
      // If B2B signup fails, delete the user we just created
      await prisma.user.delete({ where: { id: user.id } });

      if (b2bError instanceof ValidationError) {
        return NextResponse.json({ error: b2bError.message }, { status: 400 });
      }
      throw b2bError;
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    // Store token in database (expires in 24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.verificationToken.create({
      data: {
        identifier: email.toLowerCase(),
        token: hashedToken,
        expires: expiresAt,
      },
    });

    // Send verification email
    const verificationUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/auth/verify-email?token=${verificationToken}`;

    try {
      await sendEmailVerification({
        to: email,
        userName: name || "there",
        verificationUrl,
        expiresAt,
      });
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      // Don't fail registration if email fails to send
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        message: "Account created! Please check your email to verify your account.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
