// services/getUserRole.ts
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../app/firebaseConfig';

export type UserRole = 'volunteer' | 'expert' | 'admin';

export interface UserRoleInfo {
  role: UserRole;
  isAdmin: boolean;
  isExpert: boolean;
  isVolunteer: boolean;
}

/**
 * Get the user's role from Firestore
 * Supports both role string field and boolean isAdmin/isExpert fields
 */
export async function getUserRole(): Promise<UserRoleInfo> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { role: 'volunteer', isAdmin: false, isExpert: false, isVolunteer: true };
    }
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      return { role: 'volunteer', isAdmin: false, isExpert: false, isVolunteer: true };
    }
    
    const data = userDoc.data();
    return checkRoleFromData(data);
  } catch (error) {
    console.error('Error getting user role:', error);
    return { role: 'volunteer', isAdmin: false, isExpert: false, isVolunteer: true };
  }
}

/**
 * Get the appropriate home screen route based on user role
 */
export async function getHomeScreenRoute(): Promise<string> {
  const { role } = await getUserRole();
  switch (role) {
    case 'admin': return './adminHomeScreen';
    case 'expert': return './expertHomeScreen';
    default: return './volunteerHomeScreen';
  }
}

/**
 * Check user role from data object (for use when you already have the data)
 * Handles case-insensitive role string comparison
 */
export function checkRoleFromData(data: any): UserRoleInfo {
  // Handle case-insensitive role string (e.g., "Expert", "ADMIN", "volunteer")
  const roleStr = (data?.role || '').toString().toLowerCase();
  const isAdmin = data?.isAdmin === true || roleStr === 'admin';
  const isExpert = data?.isExpert === true || roleStr === 'expert';
  
  let role: UserRole = 'volunteer';
  if (isAdmin) {
    role = 'admin';
  } else if (isExpert) {
    role = 'expert';
  }
  
  return {
    role,
    isAdmin,
    isExpert,
    isVolunteer: !isAdmin && !isExpert,
  };
}
