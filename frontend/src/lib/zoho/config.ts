/**
 * Zoho API Configuration
 * Handles region-specific API endpoints
 */

export type ZohoRegion = 'US' | 'EU' | 'IN' | 'AU' | 'JP' | 'CA' | 'CN';

interface ZohoRegionConfig {
  accountsUrl: string;
  apiDomain: string;
  booksApiUrl: string;
}

const REGION_CONFIGS: Record<ZohoRegion, ZohoRegionConfig> = {
  US: {
    accountsUrl: 'https://accounts.zoho.com',
    apiDomain: 'https://www.zohoapis.com',
    booksApiUrl: 'https://books.zoho.com/api/v3',
  },
  EU: {
    accountsUrl: 'https://accounts.zoho.eu',
    apiDomain: 'https://www.zohoapis.eu',
    booksApiUrl: 'https://books.zoho.eu/api/v3',
  },
  IN: {
    accountsUrl: 'https://accounts.zoho.in',
    apiDomain: 'https://www.zohoapis.in',
    booksApiUrl: 'https://books.zoho.in/api/v3',
  },
  AU: {
    accountsUrl: 'https://accounts.zoho.com.au',
    apiDomain: 'https://www.zohoapis.com.au',
    booksApiUrl: 'https://books.zoho.com.au/api/v3',
  },
  JP: {
    accountsUrl: 'https://accounts.zoho.jp',
    apiDomain: 'https://www.zohoapis.jp',
    booksApiUrl: 'https://books.zoho.jp/api/v3',
  },
  CA: {
    accountsUrl: 'https://accounts.zoho.ca',
    apiDomain: 'https://www.zohoapis.ca',
    booksApiUrl: 'https://books.zoho.ca/api/v3',
  },
  CN: {
    accountsUrl: 'https://accounts.zoho.com.cn',
    apiDomain: 'https://www.zohoapis.com.cn',
    booksApiUrl: 'https://books.zoho.com.cn/api/v3',
  },
};

/**
 * Get Zoho region from environment variable
 */
export function getZohoRegion(): ZohoRegion {
  const region = (process.env.ZOHO_REGION || 'IN') as ZohoRegion;

  if (!REGION_CONFIGS[region]) {
    console.warn(`Invalid ZOHO_REGION: ${region}, falling back to IN (India)`);
    return 'IN';
  }

  return region;
}

/**
 * Get region-specific configuration
 */
export function getZohoConfig(): ZohoRegionConfig {
  const region = getZohoRegion();
  return REGION_CONFIGS[region];
}

/**
 * Get Zoho Books API base URL for current region
 */
export function getZohoBooksApiUrl(): string {
  return getZohoConfig().booksApiUrl;
}

/**
 * Get Zoho Accounts URL for OAuth (current region)
 */
export function getZohoAccountsUrl(): string {
  return getZohoConfig().accountsUrl;
}

/**
 * Get Zoho API domain for current region
 */
export function getZohoApiDomain(): string {
  return getZohoConfig().apiDomain;
}
