// services/config.ts

/**
 * Central place for API configuration.
 *
 * The base URL comes from EXPO_PUBLIC_API_BASE_URL so that:
 * - On real devices / teammates' phones, you can point to Cloud Run
 * - For local testing, you can temporarily point to http://YOUR_IP:8000

 * Example .env values:
 *   EXPO_PUBLIC_API_BASE_URL=https://frogwatch-backend-1066546787031.us-central1.run.app
 *   # or for local testing:
 *   # EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000
 */

export const API_CONFIG = {
  // Base URL for all backend calls
  BASE_URL: (
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    'https://frogwatch-backend-1066546787031.us-central1.run.app'
  ).replace(/\/$/, ''), // strip trailing slash if someone adds it

  // Timeout for API requests (in milliseconds)
  TIMEOUT: 30000,

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
};

export default API_CONFIG;
