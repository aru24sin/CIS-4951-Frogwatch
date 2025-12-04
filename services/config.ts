// services/config.ts
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

/**
 * Get the development host for API calls
 * This handles running on emulators, simulators, and physical devices
 */
function getDevHost(): string {
  // Try to get from Expo config
  const hostUri = 
    (Constants as any)?.expoGoConfig?.hostUri ??
    (Constants as any)?.expoGoConfig?.debuggerHost ??
    (Constants as any)?.expoConfig?.hostUri ??
    '';

  if (hostUri) {
    const h = String(hostUri).split(':')[0];
    if (h) return h;
  }

  // Try to get from React Native source code URL
  const scriptURL: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  const m = scriptURL?.match(/\/\/([^/:]+):\d+/);
  if (m?.[1]) return m[1];

  // Android emulator localhost
  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  return 'localhost';
}

/**
 * API Configuration
 * 
 * IMPORTANT: Before deploying to production, update PROD_URL with your deployed API URL.
 * 
 * Deployment options:
 * - Railway: https://your-app.up.railway.app
 * - Render: https://your-app.onrender.com
 * - Fly.io: https://your-app.fly.dev
 * - Google Cloud Run: https://your-app-xxxxx.run.app
 */
export const API_CONFIG = {
  // Development URL - uses dynamic host detection for local testing
  DEV_URL: `http://${getDevHost()}:8000`,
  
  // ========================================
  // PRODUCTION URL - UPDATE THIS BEFORE RELEASE!
  // ========================================
  // After deploying your API server, replace this with your actual URL:
  // Example: 'https://frogwatch-api-production.up.railway.app'
  PROD_URL: 'https://frogwatch-api.up.railway.app',
  
  // Get the current API base URL based on environment
  get BASE_URL(): string {
    // In production builds, always use PROD_URL
    // In development, use DEV_URL (local server)
    return __DEV__ ? this.DEV_URL : this.PROD_URL;
  },

  // Timeout for API requests (in milliseconds)
  TIMEOUT: 30000,

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
};

export default API_CONFIG;
