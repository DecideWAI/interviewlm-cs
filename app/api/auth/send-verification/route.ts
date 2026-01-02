import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { sendEmailVerification } from "@/lib/services/email";
import { redisEmailVerificationRateLimit } from "@/lib/middleware/redis-rate-limit";
import { authTurnstileVerifier } from "@/lib/middleware/turnstile";

export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting first
    const rateLimited = await redisEmailVerificationRateLimit(req);
    if (rateLimited) return rateLimited;

    const body = await req.json();
    const { email } = body;

    // Verify Turnstile token
    const turnstileResult = await authTurnstileVerifier(req, body);
    if (turnstileResult) return turnstileResult;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // For security, always return success even if user doesn't exist
    if (!user) {
      return NextResponse.json({
        message: "If an account exists, a verification email has been sent",
      });
    }

    // Check if email is already verified
    if (user.emailVerified) {
      return NextResponse.json({
        message: "Email is already verified",
      });
    }

    // Delete any existing verification tokens for this email
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: email.toLowerCase(),
      },
    });

    // Generate new verification token
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
        userName: user.name || "there",
        verificationUrl,
        expiresAt,
      });
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      // Don't expose email sending errors to the user
    }

    return NextResponse.json({
      message: "If an account exists, a verification email has been sent",
    });
  } catch (error) {
    console.error("Send verification email error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
