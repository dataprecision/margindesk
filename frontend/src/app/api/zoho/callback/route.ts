import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getZohoAccountsUrl, getZohoApiDomain } from "@/lib/zoho/config";

const prisma = new PrismaClient();

/**
 * GET /api/zoho/callback
 * OAuth callback from Zoho Books
 * Exchanges authorization code for access/refresh tokens
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      return NextResponse.redirect(
        new URL(
          `/settings?error=${encodeURIComponent(error)}&message=${encodeURIComponent("Zoho authorization failed")}`,
          baseUrl
        )
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL(
          "/settings?error=missing_code&message=Authorization code not received",
          baseUrl
        )
      );
    }

    // Exchange code for tokens
    const accountsUrl = getZohoAccountsUrl();
    const tokenResponse = await fetch(`${accountsUrl}/oauth/v2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        redirect_uri: process.env.ZOHO_REDIRECT_URI!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(
        new URL(
          `/settings?error=token_exchange_failed&message=${encodeURIComponent(errorText)}`,
          baseUrl
        )
      );
    }

    const tokenData = await tokenResponse.json();

    // Log the token response for debugging
    console.log("🔍 Zoho Books OAuth Token Response:");
    console.log("- Has access_token:", !!tokenData.access_token);
    console.log("- Has refresh_token:", !!tokenData.refresh_token);
    console.log("- Has api_domain:", !!tokenData.api_domain);
    console.log("- Expires in:", tokenData.expires_in, "seconds");
    console.log("- Token type:", tokenData.token_type);
    if (!tokenData.refresh_token) {
      console.warn("⚠️ WARNING: No refresh_token received from Zoho!");
      console.warn("⚠️ This means token cannot be auto-refreshed and will need manual reconnection");
    }
    console.log("Full response (sanitized):", {
      ...tokenData,
      access_token: tokenData.access_token ? `${tokenData.access_token.substring(0, 20)}...` : undefined,
      refresh_token: tokenData.refresh_token ? `${tokenData.refresh_token.substring(0, 20)}...` : undefined,
    });

    // Get organization ID - use config-based API domain
    const apiDomain = tokenData.api_domain || getZohoApiDomain();

    // Store tokens first, then try to get organization ID
    // Organization ID can be added manually later if this fails
    let organizationId = process.env.ZOHO_ORGANIZATION_ID || "";
    let organizationName = "Zoho Books Organization";

    // Try to fetch organization if we don't have it in env
    if (!organizationId) {
      try {
        const orgsResponse = await fetch(`${apiDomain}/books/v3/organizations`, {
          headers: {
            Authorization: `Zoho-oauthtoken ${tokenData.access_token}`,
          },
        });

        if (orgsResponse.ok) {
          const orgsData = await orgsResponse.json();
          const organization = orgsData.organizations?.[0];
          if (organization) {
            organizationId = organization.organization_id;
            organizationName = organization.name;
          }
        } else {
          console.warn("Could not fetch organizations, will need manual configuration");
        }
      } catch (error) {
        console.warn("Error fetching organizations:", error);
      }
    }

    // Store tokens in database
    const config = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      api_domain: apiDomain,
      organization_id: organizationId,
      organization_name: organizationName,
      expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : 0,
    };

    console.log("💾 Saving config to database:");
    console.log("- Has refresh_token in config:", !!config.refresh_token);
    console.log("- Expires at:", config.expires_at ? new Date(config.expires_at).toISOString() : "unknown");
    console.log("- Organization:", organizationName, `(${organizationId})`);

    await prisma.integrationSettings.upsert({
      where: { key: "zoho_books" },
      create: {
        key: "zoho_books",
        config,
      },
      update: {
        config,
      },
    });

    console.log("✅ Config saved successfully to database");

    // Redirect to settings with success message
    const successMessage = organizationId
      ? `Connected to ${organizationName}`
      : `Connected successfully. Please add Organization ID in .env file`;

    return NextResponse.redirect(
      new URL(
        `/settings?success=true&message=${encodeURIComponent(successMessage)}`,
        baseUrl
      )
    );
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(
        `/settings?error=unknown&message=${encodeURIComponent(error.message)}`,
        baseUrl
      )
    );
  }
}
