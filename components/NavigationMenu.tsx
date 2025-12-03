// components/NavigationMenu.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../app/firebaseConfig';

type NavigationMenuProps = {
  isVisible: boolean;
  onClose: () => void;
};

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  roles?: ('volunteer' | 'expert' | 'admin')[];
};

const { width } = Dimensions.get('window');

export default function NavigationMenu({ isVisible, onClose }: NavigationMenuProps) {
  const router = useRouter();
  const [slideAnim] = useState(new Animated.Value(width));
  const [userRole, setUserRole] = useState<'volunteer' | 'expert' | 'admin'>('volunteer');
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

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
        
        // Check both role field (string) and boolean fields for compatibility
        const userRoleStr = data.role?.toLowerCase() || '';
        const isAdmin = data.isAdmin === true || userRoleStr === 'admin';
        const isExpert = data.isExpert === true || userRoleStr === 'expert';
        
        if (isAdmin) {
          setUserRole('admin');
        } else if (isExpert) {
          setUserRole('expert');
        } else {
          setUserRole('volunteer');
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const getHomeRoute = () => {
    switch (userRole) {
      case 'admin': return './adminHomeScreen';
      case 'expert': return './expertHomeScreen';
      default: return './volunteerHomeScreen';
    }
  };

  const menuItems: MenuItem[] = [
    { icon: 'home', label: 'Home', route: getHomeRoute() },
    { icon: 'radio-button-on', label: 'Recording', route: './recordScreen', roles: ['volunteer', 'expert'] },
    { icon: 'bookmark', label: 'History', route: './historyScreen', roles: ['volunteer', 'expert'] },
    { icon: 'map', label: 'Map', route: './mapHistoryScreen', roles: ['volunteer', 'expert'] },
    { icon: 'time', label: 'Review Queue', route: './expert', roles: ['expert', 'admin'] },
    { icon: 'people', label: 'Users', route: './usersScreen', roles: ['admin'] },
    { icon: 'person-circle', label: 'Profile', route: './profileScreen' },
    { icon: 'settings', label: 'Settings', route: './settingsScreen' },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  });

  const handleNavigation = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 100);
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

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTouch} onPress={onClose} activeOpacity={1} />
        
        <Animated.View
          style={[
            styles.menuContainer,
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* Header with user info */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            
            <View style={styles.userInfo}>
              <View style={styles.avatarContainer}>
                <Ionicons name="person" size={40} color="#d4ff00" />
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{userEmail}</Text>
                <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor() }]}>
                  <Text style={styles.roleText}>{getRoleLabel()}</Text>
                </View>
              </View>
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
                <Ionicons name={item.icon} size={24} color="#d4ff00" />
                <Text style={styles.menuItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={20} color="#888" />
              </TouchableOpacity>
            ))}
          </View>

          {/* Logout Button */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flexDirection: 'row',
  },
  overlayTouch: {
    flex: 1,
  },
  menuContainer: {
    width: width * 0.8,
    maxWidth: 320,
    backgroundColor: '#2d3e34',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 255, 0, 0.2)',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(212, 255, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
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
  userEmail: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  menuItems: {
    flex: 1,
    paddingVertical: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginLeft: 16,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 255, 0, 0.2)',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FF6B6B',
    marginLeft: 16,
  },
});
