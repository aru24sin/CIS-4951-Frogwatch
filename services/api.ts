// services/api.ts
import { auth } from '../app/firebaseConfig';
import API_CONFIG from './config';

// API Base URL from config
const API_BASE_URL = API_CONFIG.BASE_URL;

/**
 * Get the current user's ID token for API authentication
 */
async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `API Error: ${response.status}`);
  }

  return response.json();
}

/**
 * Make an authenticated multipart form request (for file uploads)
 */
async function apiUpload<T>(
  endpoint: string,
  formData: FormData
): Promise<T> {
  const token = await getAuthToken();
  
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Don't set Content-Type for FormData - browser will set it with boundary

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Upload Error: ${response.status}`);
  }

  return response.json();
}

// ============= AUTH API =============

export const authAPI = {
  /**
   * Login with email and password via backend
   */
  login: (email: string, password: string) =>
    apiRequest<{
      uid: string;
      idToken: string;
      refreshToken: string;
      expiresIn: number;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /**
   * Login with username (backend looks up email)
   */
  loginByUsername: (username: string, password: string) =>
    apiRequest<{
      uid: string;
      idToken: string;
      refreshToken: string;
      expiresIn: number;
    }>('/auth/login-username', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  /**
   * Register new user via backend
   */
  register: (email: string, password: string, displayName: string, role: string) =>
    apiRequest<{ uid: string; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        display_name: displayName,
        role: role.toLowerCase(),
      }),
    }),

  /**
   * Refresh token
   */
  refreshToken: (refreshToken: string) =>
    apiRequest<{
      uid: string;
      idToken: string;
      refreshToken: string;
      expiresIn: number;
    }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  /**
   * Send forgot password email
   */
  forgotPassword: (email: string) =>
    apiRequest<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(email),
    }),

  /**
   * Get current user info
   */
  me: () => apiRequest<{ uid: string; email: string | null }>('/auth/me'),
};

// ============= USERS API =============

export const usersAPI = {
  /**
   * Get all users (admin only)
   */
  listUsers: () => apiRequest<any[]>('/users'),

  /**
   * Get user by ID
   */
  getUser: (userId: string) => apiRequest<any>(`/users/${userId}`),

  /**
   * Create or update user profile
   */
  updateProfile: (profile: {
    userId: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    securityQuestions: string[];
    securityAnswers: string[];
    fcmToken?: string;
  }) =>
    apiRequest<{ message: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(profile),
    }),

  /**
   * Initiate forgot password flow
   */
  forgotPasswordInitiate: (username: string) =>
    apiRequest<{ userId: string; securityQuestions: string[] }>(
      '/users/forgot-password/initiate',
      {
        method: 'POST',
        body: JSON.stringify({ username }),
      }
    ),

  /**
   * Verify security answers and reset password
   */
  forgotPasswordVerify: (userId: string, answers: string[], newPassword: string) =>
    apiRequest<{ message: string }>('/users/forgot-password/verify', {
      method: 'POST',
      body: JSON.stringify({ userId, answers, newPassword }),
    }),

  /**
   * Update security Q&A
   */
  updateSecurityQA: (userId: string, questions: string[], answers: string[]) =>
    apiRequest<{ message: string }>('/users/security-qa', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        securityQuestions: questions,
        securityAnswers: answers,
      }),
    }),

  /**
   * Update user role (admin only)
   */
  updateRole: (userId: string, newRole: string) =>
    apiRequest<{ message: string }>(`/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ newRole }),
    }),

  /**
   * Update user settings
   */
  updateSettings: (userId: string, shareGPS: boolean, notificationsEnabled: boolean) =>
    apiRequest<{ message: string }>('/users/settings', {
      method: 'POST',
      body: JSON.stringify({ userId, shareGPS, notificationsEnabled }),
    }),

  /**
   * Get user settings
   */
  getSettings: (userId: string) =>
    apiRequest<{ shareGPS: boolean; notificationsEnabled: boolean }>(
      `/users/settings/${userId}`
    ),

  /**
   * Test push notification
   */
  testPush: (fcmToken: string, title?: string, body?: string) =>
    apiRequest<{ message: string }>('/users/test-push', {
      method: 'POST',
      body: JSON.stringify({ fcmToken, title, body }),
    }),
};

// ============= RECORDINGS API =============

export const recordingsAPI = {
  /**
   * Upload audio file
   */
  uploadAudio: async (
    userId: string,
    audioFile: { uri: string; name: string; type: string },
    species?: string,
    latitude?: number,
    longitude?: number
  ) => {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('audio_file', {
      uri: audioFile.uri,
      name: audioFile.name,
      type: audioFile.type,
    } as any);
    if (species) formData.append('species', species);
    if (latitude !== undefined) formData.append('latitude', latitude.toString());
    if (longitude !== undefined) formData.append('longitude', longitude.toString());

    return apiUpload<{ message: string; recordingId: string; audioURL: string }>(
      '/recordings/upload-audio',
      formData
    );
  },

  /**
   * Create recording metadata
   */
  createRecording: (recording: {
    recordingId: string;
    userId: string;
    species?: string;
    predictedSpecies?: string;
    audioURL: string;
    location?: { lat: number; lng: number };
    status?: string;
    timestamp: string;
  }) =>
    apiRequest<{ message: string }>('/recordings', {
      method: 'POST',
      body: JSON.stringify(recording),
    }),

  /**
   * Get current user's recordings
   */
  myRecordings: () => apiRequest<any[]>('/recordings/my'),

  /**
   * Get recordings by user (admin only)
   */
  getByUser: (userId: string) => apiRequest<any[]>(`/recordings/user/${userId}`),

  /**
   * Get pending recordings (expert/admin)
   */
  listPending: () => apiRequest<any[]>('/recordings/pending'),

  /**
   * Get review queue (expert/admin)
   */
  reviewQueue: () => apiRequest<any[]>('/recordings/review-queue'),

  /**
   * Get all recordings (admin only)
   */
  listAll: (roleFilter?: string, statusFilter?: string) => {
    const params = new URLSearchParams();
    if (roleFilter) params.append('role_filter', roleFilter);
    if (statusFilter) params.append('status_filter', statusFilter);
    const query = params.toString();
    return apiRequest<any[]>(`/recordings/all${query ? `?${query}` : ''}`);
  },

  /**
   * Get reviewed recordings
   */
  listReviewed: () => apiRequest<any[]>('/recordings/reviewed'),

  /**
   * Download recording
   */
  download: (recordingId: string) =>
    apiRequest<{ downloadUrl: string }>(`/recordings/download/${recordingId}`),

  /**
   * Get single recording
   */
  get: (recordingId: string) => apiRequest<any>(`/recordings/${recordingId}`),

  /**
   * Approve recording (expert/admin)
   */
  approve: (recordingId: string, confidence?: number, notes?: string) =>
    apiRequest<{ message: string }>(`/recordings/${recordingId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ confidence, notes }),
    }),

  /**
   * Reject recording (expert/admin)
   */
  reject: (recordingId: string, confidence?: number, notes?: string) =>
    apiRequest<{ message: string }>(`/recordings/${recordingId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ confidence, notes }),
    }),

  /**
   * Delete recording (admin only)
   */
  delete: (recordingId: string) =>
    apiRequest<{ message: string }>(`/recordings/${recordingId}`, {
      method: 'DELETE',
    }),
};

// ============= ML/PREDICTION API =============

export const mlAPI = {
  /**
   * Predict species from audio file
   */
  predict: async (
    audioFile: { uri: string; name: string; type: string },
    lat?: number,
    lon?: number
  ) => {
    const formData = new FormData();
    formData.append('file', {
      uri: audioFile.uri,
      name: audioFile.name,
      type: audioFile.type,
    } as any);
    if (lat !== undefined) formData.append('lat', lat.toString());
    if (lon !== undefined) formData.append('lon', lon.toString());

    return apiUpload<{
      prediction: string;
      confidence: number;
      top_k?: Array<{ species: string; confidence: number }>;
    }>('/ml/predict', formData);
  },

  /**
   * Alternative predict endpoint
   */
  predictAudio: async (
    audioFile: { uri: string; name: string; type: string },
    lat?: number,
    lon?: number
  ) => {
    const formData = new FormData();
    formData.append('file', {
      uri: audioFile.uri,
      name: audioFile.name,
      type: audioFile.type,
    } as any);
    if (lat !== undefined) formData.append('lat', lat.toString());
    if (lon !== undefined) formData.append('lon', lon.toString());

    return apiUpload<any>('/predict', formData);
  },
};

// ============= SETTINGS API =============

export const settingsAPI = {
  /**
   * Get user settings
   */
  get: () =>
    apiRequest<{
      notifications: {
        push: boolean;
        email: boolean;
        recording_updates: boolean;
        expert_responses: boolean;
        weekly_digest: boolean;
        sounds: boolean;
      };
      permissions: {
        location_always: boolean;
        location_while_using: boolean;
        microphone: boolean;
        camera: boolean;
        photo_library: boolean;
      };
      privacy: {
        profile_visible: boolean;
        show_location: boolean;
        show_recordings: boolean;
        data_collection: boolean;
      };
      preferences: {
        dark_mode: boolean;
        autoplay_audio: boolean;
        high_quality_audio: boolean;
        language: string;
        units: string;
      };
      expert_access: {
        requested: boolean;
        approved: boolean;
      };
    }>('/settings/'),

  /**
   * Update settings (partial update)
   */
  update: (settings: {
    notifications?: Partial<{
      push: boolean;
      email: boolean;
      recording_updates: boolean;
      expert_responses: boolean;
      weekly_digest: boolean;
      sounds: boolean;
    }>;
    permissions?: Partial<{
      location_always: boolean;
      location_while_using: boolean;
      microphone: boolean;
      camera: boolean;
      photo_library: boolean;
    }>;
    privacy?: Partial<{
      profile_visible: boolean;
      show_location: boolean;
      show_recordings: boolean;
      data_collection: boolean;
    }>;
    preferences?: Partial<{
      dark_mode: boolean;
      autoplay_audio: boolean;
      high_quality_audio: boolean;
      language: string;
      units: string;
    }>;
    expert_access?: Partial<{
      requested: boolean;
      approved: boolean;
    }>;
  }) =>
    apiRequest<any>('/settings/', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  /**
   * Reset settings to defaults
   */
  reset: () =>
    apiRequest<any>('/settings/', {
      method: 'DELETE',
    }),
};

// ============= FEEDBACK API =============

export const feedbackAPI = {
  /**
   * Submit feedback
   */
  create: (message: string, rating?: number, recordingId?: string) =>
    apiRequest<{ message: string }>('/feedback/', {
      method: 'POST',
      body: JSON.stringify({ message, rating, recordingId }),
    }),

  /**
   * Get my feedback
   */
  listMine: () => apiRequest<any[]>('/feedback/'),

  /**
   * Get all feedback (admin only)
   */
  listAll: (roleFilter?: string, recordingId?: string) => {
    const params = new URLSearchParams();
    if (roleFilter) params.append('role_filter', roleFilter);
    if (recordingId) params.append('recording_id', recordingId);
    const query = params.toString();
    return apiRequest<any[]>(`/feedback/all${query ? `?${query}` : ''}`);
  },

  /**
   * Delete feedback
   */
  delete: (feedbackId: string) =>
    apiRequest<{ message: string }>(`/feedback/${feedbackId}`, {
      method: 'DELETE',
    }),

  /**
   * Respond to feedback (admin only)
   */
  respond: (feedbackId: string, response: string) =>
    apiRequest<{ message: string }>(`/feedback/${feedbackId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),
};

// ============= APPROVALS API =============

export const approvalsAPI = {
  /**
   * Get all approvals
   */
  list: () => apiRequest<any[]>('/approvals/'),

  /**
   * Create approval
   */
  create: (approval: {
    approvalId: string;
    expertId: string;
    recordingId: string;
    approved: boolean;
    confidenceScore: number;
    trustedLabel: string;
    comments?: string;
  }) =>
    apiRequest<any>('/approvals/', {
      method: 'POST',
      body: JSON.stringify(approval),
    }),

  /**
   * Get approval by recording
   */
  getByRecording: (recordingId: string) =>
    apiRequest<any>(`/approvals/${recordingId}`),

  /**
   * Update approval
   */
  update: (approvalId: string, data: any) =>
    apiRequest<any>(`/approvals/${approvalId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete approval
   */
  delete: (approvalId: string) =>
    apiRequest<{ message: string }>(`/approvals/${approvalId}`, {
      method: 'DELETE',
    }),
};

// ============= ADMIN API =============

export const adminAPI = {
  /**
   * List submissions
   */
  listSubmissions: () => apiRequest<any[]>('/admin/submissions'),

  /**
   * Update submission status
   */
  updateSubmissionStatus: (recordingId: string, status: string) =>
    apiRequest<any>(`/admin/submissions/${recordingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  /**
   * List users
   */
  listUsers: () => apiRequest<any[]>('/admin/users'),

  /**
   * Get all recordings
   */
  getAllRecordings: () => apiRequest<any[]>('/admin/getAllRecordings'),

  /**
   * View recording details
   */
  viewRecordingDetails: (recordingId: string) =>
    apiRequest<any>(`/admin/viewRecordingDetails/${recordingId}`),

  /**
   * Update recording status
   */
  updateStatus: (recordingId: string, status: string) =>
    apiRequest<any>(`/admin/updateStatus/${recordingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  /**
   * Update recording confidence
   */
  updateConfidence: (recordingId: string, confidence: number) =>
    apiRequest<any>(`/admin/updateConfidence/${recordingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ confidence }),
    }),
};

// Export all APIs
export default {
  auth: authAPI,
  users: usersAPI,
  recordings: recordingsAPI,
  ml: mlAPI,
  settings: settingsAPI,
  feedback: feedbackAPI,
  approvals: approvalsAPI,
  admin: adminAPI,
};
