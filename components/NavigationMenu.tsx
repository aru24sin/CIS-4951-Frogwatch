// components/NavigationMenu.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../app/firebaseConfig';
import { checkRoleFromData } from '../services/getUserRole';

const { width } = Dimensions.get('window');

type Props = {
  isVisible: boolean;
  onClose: () => void;
};

type UserRole = 'volunteer' | 'expert' | 'admin';

export default function NavigationMenu({ isVisible, onClose }: Props) {
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(width)).current;
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('volunteer');

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    if (isVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: width,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible]);

  const loadUserData = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      setUserEmail(user.email || '');
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const firstName = data.firstName || data.firstname || '';
        const lastName = data.lastName || data.lastname || '';
        setUserName(`${firstName} ${lastName}`.trim() || 'User');
        
        // Use centralized role checking
        const roleInfo = checkRoleFromData(data);
        setUserRole(roleInfo.role);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const getHomeScreen = () => {
    switch (userRole) {
      case 'admin': return './adminHomeScreen';
      case 'expert': return './expertHomeScreen';
      default: return './volunteerHomeScreen';
    }
  };

  const getRoleBadgeColor = () => {
    switch (userRole) {
      case 'admin': return '#FF6B6B';
      case 'expert': return '#4db8e8';
      default: return '#4CAF50';
    }
  };

  const getRoleLabel = () => {
    switch (userRole) {
      case 'admin': return 'Admin';
      case 'expert': return 'Expert';
      default: return 'Volunteer';
    }
  };

  const menuItems = [
    { icon: 'home', label: 'Home', route: getHomeScreen(), roles: ['volunteer', 'expert', 'admin'] },
    { icon: 'radio-button-on', label: 'Recording', route: './recordScreen', roles: ['volunteer', 'expert'] },
    { icon: 'bookmark', label: 'History', route: './historyScreen', roles: ['volunteer', 'expert'] },
    { icon: 'map', label: 'Map', route: './mapHistoryScreen', roles: ['volunteer', 'expert', 'admin'] },
    { icon: 'time', label: 'Review Queue', route: './expert', roles: ['expert', 'admin'] },
    { icon: 'people', label: 'Users', route: './usersScreen', roles: ['admin'] },
    { icon: 'person-circle', label: 'Profile', route: './profileScreen', roles: ['volunteer', 'expert', 'admin'] },
    { icon: 'chatbubble-ellipses', label: 'Feedback', route: './feedbackScreen', roles: ['volunteer', 'expert', 'admin'] },
    { icon: 'settings', label: 'Settings', route: './settingsScreen', roles: ['volunteer', 'expert', 'admin'] },
  ];

  const filteredMenuItems = menuItems.filter(item => item.roles.includes(userRole));

  const handleNavigation = (route: string) => {
    onClose();
    router.push(route as any);
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              onClose();
              router.replace('./landingScreen');
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert('Error', 'Failed to logout');
            }
          },
        },
      ]
    );
  };

  if (!isVisible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <Animated.View style={[styles.menu, { transform: [{ translateX: slideAnim }] }]}>
        {/* User Info */}
        <View style={styles.userSection}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color="#fff" />
          </View>
          <Text style={styles.userName}>{userName}</Text>
          <Text style={styles.userEmail}>{userEmail}</Text>
          <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor() }]}>
            <Text style={styles.roleText}>{getRoleLabel()}</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuItems}>
          {filteredMenuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={() => handleNavigation(item.route)}
            >
              <Ionicons name={item.icon as any} size={24} color="#d4ff00" />
              <Text style={styles.menuItemText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menu: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: Math.min(width * 0.8, 320),
    height: '100%',
    backgroundColor: '#2d3e34',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  userSection: {
    alignItems: 'center',
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 255, 0, 0.2)',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(212, 255, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 12,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  menuItems: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
  },
  menuItemText: {
    fontSize: 18,
    color: '#fff',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 255, 0, 0.2)',
    marginBottom: 40,
  },
  logoutText: {
    fontSize: 18,
    color: '#FF6B6B',
  },
});
