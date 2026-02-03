import { PrismaClient } from "@prisma/client";
import { getZohoAccountsUrl } from "./config";

const prisma = new PrismaClient();

interface ZohoTokens {
  access_token: string;
  organization_id: string;
  api_domain: string;
}

interface ZohoPeopleTokens {
  access_token: string;
  api_domain: string;
}

// Track ongoing refresh to prevent race conditions
let zohoBooksRefreshPromise: Promise<ZohoTokens | null> | null = null;

/**
 * Get valid Zoho Books access token, refreshing if needed
 */
export async function getZohoAccessToken(): Promise<ZohoTokens | null> {
  try {
    const settings = await prisma.integrationSettings.findUnique({
      where: { key: "zoho_books" },
    });

    if (!settings) {
      console.error("❌ Zoho Books settings not found");
      return null;
    }

    const config = settings.config as any;
    const now = Date.now();

    // Check if token is still valid (with 5-minute buffer)
    if (config.expires_at && !isNaN(config.expires_at) && config.expires_at > now + 5 * 60 * 1000) {
      return {
        access_token: config.access_token,
        organization_id: config.organization_id,
        api_domain: config.api_domain,
      };
    }

    // If a refresh is already in progress, wait for it
    if (zohoBooksRefreshPromise) {
      console.log("🔄 Zoho Books refresh already in progress, waiting...");
      return await zohoBooksRefreshPromise;
    }

    // Token expired or about to expire, refresh it
    if (!config.refresh_token) {
      console.error("❌ No refresh token available for Zoho Books");
      return null;
    }

    // Start refresh and track the promise
    zohoBooksRefreshPromise = (async () => {
      try {
        console.log("⏳ Refreshing Zoho Books token...");
        const accountsUrl = getZohoAccountsUrl();
        const response = await fetch(`${accountsUrl}/oauth/v2/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            refresh_token: config.refresh_token,
            client_id: process.env.ZOHO_CLIENT_ID!,
            client_secret: process.env.ZOHO_CLIENT_SECRET!,
            grant_type: "refresh_token",
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error("❌ Failed to refresh Zoho Books token:", error);
          return null;
        }

        const data = await response.json();

        // Zoho typically returns expires_in in seconds (default 3600 = 1 hour)
        // If not provided, default to 1 hour
        const expiresInMs = (data.expires_in || 3600) * 1000;
        const newExpiresAt = now + expiresInMs;

        // Update stored token
        const updatedConfig = {
          ...config,
          access_token: data.access_token,
          expires_at: newExpiresAt,
          api_domain: data.api_domain || config.api_domain,
        };

        await prisma.integrationSettings.update({
          where: { key: "zoho_books" },
          data: { config: updatedConfig },
        });

        console.log("✅ Zoho Books token refreshed successfully");

        return {
          access_token: data.access_token,
          organization_id: config.organization_id,
          api_domain: updatedConfig.api_domain,
        };
      } finally {
        // Clear the promise when done
        zohoBooksRefreshPromise = null;
      }
    })();

    return await zohoBooksRefreshPromise;
  } catch (error) {
    console.error("❌ Error getting Zoho Books access token:", error);
    zohoBooksRefreshPromise = null;
    return null;
  }
}

// Track ongoing refresh to prevent race conditions
let zohoPeopleRefreshPromise: Promise<ZohoPeopleTokens | null> | null = null;

/**
 * Get valid Zoho People access token, refreshing if needed
 */
export async function getZohoPeopleAccessToken(): Promise<ZohoPeopleTokens | null> {
  try {
    const settings = await prisma.integrationSettings.findUnique({
      where: { key: "zoho_people" },
    });

    if (!settings) {
      console.error("❌ Zoho People settings not found");
      return null;
    }

    const config = settings.config as any;
    const now = Date.now();

    console.log("🔍 Checking Zoho People token validity...");
    console.log("Current time:", new Date(now).toISOString());
    console.log("Token expires at:", config.expires_at ? new Date(config.expires_at).toISOString() : "undefined");
    console.log("Has refresh token:", !!config.refresh_token);

    // Check if token is still valid (with 5-minute buffer)
    if (config.expires_at && !isNaN(config.expires_at) && config.expires_at > now + 5 * 60 * 1000) {
      console.log("✅ Token is still valid");
      return {
        access_token: config.access_token,
        api_domain: config.api_domain,
      };
    }

    console.log("⏳ Token expired or about to expire, refreshing...");

    // If a refresh is already in progress, wait for it
    if (zohoPeopleRefreshPromise) {
      console.log("🔄 Refresh already in progress, waiting...");
      return await zohoPeopleRefreshPromise;
    }

    // Token expired or about to expire, refresh it
    if (!config.refresh_token) {
      console.error("❌ No refresh token available for Zoho People");
      return null;
    }

    // Start refresh and track the promise
    zohoPeopleRefreshPromise = (async () => {
      try {
        const accountsUrl = getZohoAccountsUrl();
        console.log("🌐 Refreshing token from:", accountsUrl);

        const response = await fetch(`${accountsUrl}/oauth/v2/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            refresh_token: config.refresh_token,
            client_id: process.env.ZOHO_CLIENT_ID!,
            client_secret: process.env.ZOHO_CLIENT_SECRET!,
            grant_type: "refresh_token",
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error("❌ Failed to refresh Zoho People token:", error);
          return null;
        }

        const data = await response.json();
        console.log("✅ Token refresh response received");
        console.log("Response data:", {
          has_access_token: !!data.access_token,
          expires_in: data.expires_in,
          api_domain: data.api_domain,
        });

        // Zoho typically returns expires_in in seconds (default 3600 = 1 hour)
        // If not provided, default to 1 hour
        const expiresInMs = (data.expires_in || 3600) * 1000;
        const newExpiresAt = now + expiresInMs;

        console.log("New expiry time:", new Date(newExpiresAt).toISOString());

        // Update stored token
        const updatedConfig = {
          ...config,
          access_token: data.access_token,
          expires_at: newExpiresAt,
          api_domain: data.api_domain || config.api_domain,
        };

        await prisma.integrationSettings.update({
          where: { key: "zoho_people" },
          data: { config: updatedConfig },
        });

        console.log("✅ Token refreshed and stored successfully");

        return {
          access_token: data.access_token,
          api_domain: updatedConfig.api_domain,
        };
      } finally {
        // Clear the promise when done
        zohoPeopleRefreshPromise = null;
      }
    })();

    return await zohoPeopleRefreshPromise;
  } catch (error) {
    console.error("❌ Error getting Zoho People access token:", error);
    zohoPeopleRefreshPromise = null;
    return null;
  }
}
