import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getZohoAccountsUrl, getZohoApiDomain } from "@/lib/zoho/config";

const prisma = new PrismaClient();

/**
 * GET /api/zoho-people/callback
 * OAuth callback from Zoho People
 * Exchanges authorization code for access/refresh tokens
 */
export async function GET(req: NextRequest) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || req.url;
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      return NextResponse.redirect(
        new URL(
          `/settings?error=${encodeURIComponent(error)}&message=${encodeURIComponent("Zoho People authorization failed")}`,
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
    const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin;
    const redirect_uri = `${origin}/api/zoho-people/callback`;

    console.log("=== ZOHO PEOPLE TOKEN EXCHANGE REQUEST ===");
    console.log("- redirect_uri:", redirect_uri);
    console.log("- accountsUrl:", accountsUrl);

    const tokenResponse = await fetch(`${accountsUrl}/oauth/v2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        redirect_uri,
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

    // Log token data for debugging
    console.log("=== ZOHO PEOPLE TOKEN EXCHANGE RESPONSE ===");
    console.log("Full Token Data Keys:", Object.keys(tokenData));
    console.log("Access Token:", tokenData.access_token ? "✓ Present" : "✗ MISSING");
    console.log("Refresh Token:", tokenData.refresh_token ? "✓ Present" : "✗ MISSING");
    console.log("Expires In:", tokenData.expires_in);
    console.log("API Domain:", tokenData.api_domain);

    // Check for error in response body (Zoho returns HTTP 200 with error in JSON)
    if (tokenData.error) {
      console.error("Zoho token exchange returned error:", tokenData.error);
      return NextResponse.redirect(
        new URL(
          `/settings?error=${encodeURIComponent(tokenData.error)}&message=${encodeURIComponent(`Zoho People token exchange failed: ${tokenData.error}`)}`,
          baseUrl
        )
      );
    }

    if (!tokenData.access_token) {
      console.error("No access_token in Zoho response:", JSON.stringify(tokenData));
      return NextResponse.redirect(
        new URL(
          `/settings?error=no_access_token&message=${encodeURIComponent("No access token received from Zoho People")}`,
          baseUrl
        )
      );
    }

    // Get API domain
    const apiDomain = tokenData.api_domain || getZohoApiDomain();

    // Try to fetch organization name from Zoho People
    let organizationName = "Zoho People Organization";

    try {
      const orgsResponse = await fetch(`${apiDomain}/people/api/forms`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokenData.access_token}`,
        },
      });

      if (orgsResponse.ok) {
        const orgsData = await orgsResponse.json();
        // Zoho People doesn't have an organizations endpoint like Books
        // We'll just use a generic name
        organizationName = "Zoho People";
      }
    } catch (error) {
      console.warn("Error fetching Zoho People info:", error);
    }

    // Store tokens in database
    const config = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      api_domain: apiDomain,
      organization_name: organizationName,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };

    console.log("=== SAVING TO DATABASE ===");
    console.log("Config object to save:");
    console.log("- access_token:", config.access_token ? "✓ Present" : "✗ MISSING");
    console.log("- refresh_token:", config.refresh_token ? "✓ Present" : "✗ MISSING");
    console.log("- api_domain:", config.api_domain);
    console.log("- organization_name:", config.organization_name);
    console.log("- expires_at:", new Date(config.expires_at).toISOString());

    await prisma.integrationSettings.upsert({
      where: { key: "zoho_people" },
      create: {
        key: "zoho_people",
        config,
      },
      update: {
        config,
      },
    });

    console.log("✓ Successfully saved Zoho People configuration to database");

    // Redirect to settings with success message
    return NextResponse.redirect(
      new URL(
        `/settings?success=true&message=${encodeURIComponent(`Connected to ${organizationName}`)}`,
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
