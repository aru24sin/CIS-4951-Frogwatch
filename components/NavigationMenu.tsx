// components/NavigationMenu.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../app/firebaseConfig';

type UserRole = 'volunteer' | 'expert' | 'admin';

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
};

type NavigationMenuProps = {
  isVisible: boolean;
  onClose: () => void;
};

// Menu items for each role
const volunteerMenuItems: MenuItem[] = [
  { icon: 'home', label: 'Home', route: './volunteerHomeScreen' },
  { icon: 'radio-button-on', label: 'Recording', route: './recordScreen' },
  { icon: 'bookmark', label: 'History', route: './historyScreen' },
  { icon: 'map', label: 'Map', route: './mapHistoryScreen' },
  { icon: 'settings', label: 'Settings', route: './settingsScreen' },
];

const expertMenuItems: MenuItem[] = [
  { icon: 'home', label: 'Home', route: './expertHomeScreen' },
  { icon: 'radio-button-on', label: 'Recording', route: './recordScreen' },
  { icon: 'bookmark', label: 'History', route: './historyScreen' },
  { icon: 'map', label: 'Map', route: './mapHistoryScreen' },
  { icon: 'time', label: 'Submissions', route: './submitsScreen' },
  { icon: 'settings', label: 'Settings', route: './settingsScreen' },
];

const adminMenuItems: MenuItem[] = [
  { icon: 'home', label: 'Home', route: './adminHomeScreen' },
  { icon: 'people', label: 'Users', route: './usersScreen' },
  { icon: 'radio-button-on', label: 'Recording', route: './recordScreen' },
  { icon: 'bookmark', label: 'History', route: './historyScreen' },
  { icon: 'map', label: 'Map', route: './mapHistoryScreen' },
  { icon: 'settings', label: 'Settings', route: './settingsScreen' },
];

export default function NavigationMenu({ isVisible, onClose }: NavigationMenuProps) {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('volunteer');
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data() || {};

        // Determine role
        if (userData.isAdmin) {
          setRole('admin');
        } else if (userData.isExpert) {
          setRole('expert');
        } else {
          setRole('volunteer');
        }

        // Get user name
        const firstName = userData.firstName || userData.firstname || '';
        const lastName = userData.lastName || userData.lastname || '';
        setUserName(`${firstName} ${lastName}`.trim() || user.email || 'User');
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    };

    if (isVisible) {
      fetchUserRole();
    }
  }, [isVisible]);

  const getMenuItems = (): MenuItem[] => {
    switch (role) {
      case 'admin':
        return adminMenuItems;
      case 'expert':
        return expertMenuItems;
      default:
        return volunteerMenuItems;
    }
  };

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
              router.replace('/');
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert('Error', 'Failed to logout');
            }
          },
        },
      ]
    );
  };

  const getRoleBadgeColor = () => {
    switch (role) {
      case 'admin':
        return '#FF6B6B';
      case 'expert':
        return '#4ECDC4';
      default:
        return '#d4ff00';
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.menuContainer}>
          {/* Header */}
          <View style={styles.menuHeader}>
            <View style={styles.userInfo}>
              <View style={styles.avatarContainer}>
                <Ionicons name="person-circle" size={50} color="#d4ff00" />
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userName}>{userName}</Text>
                <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor() }]}>
                  <Text style={styles.roleText}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Menu Items */}
          <View style={styles.menuItems}>
            {getMenuItems().map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuItem}
                onPress={() => handleNavigation(item.route)}
              >
                <Ionicons name={item.icon} size={24} color="#d4ff00" />
                <Text style={styles.menuItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={20} color="#666" />
              </TouchableOpacity>
            ))}
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: '#2d3e34',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#3d4f44',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2d3e34',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItems: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3d4f44',
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    marginLeft: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
    marginLeft: 8,
  },
});
