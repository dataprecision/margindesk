import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * POST /api/auth/create-user
 * Create a new user with email/password (for initial setup)
 *
 * IMPORTANT: This endpoint should be protected in production!
 * Consider adding an API key or disabling after initial setup.
 */
export async function POST(req: Request) {
  try {
    const { email, password, name, role = "owner" } = await req.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
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
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name: name || email,
        password: hashedPassword,
        auth_provider: "credentials",
        role: role as any, // owner, finance, pm, readonly
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        auth_provider: true,
        created_at: true,
      },
    });

    return NextResponse.json({
      success: true,
      user,
      message: "User created successfully. You can now sign in with email/password.",
    }, { status: 201 });

  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
