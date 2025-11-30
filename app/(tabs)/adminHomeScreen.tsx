// adminHomeScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function AdminHomeScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirstName(null);
        setLastName(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.data() || {};
        const fn = (data.firstName || data.firstname || "").toString().trim();
        const ln = (data.lastName || data.lastname || "").toString().trim();

        if (fn || ln) {
          setFirstName(fn || null);
          setLastName(ln || null);
        } else if (user.displayName) {
          const parts = user.displayName.trim().split(/\s+/);
          setFirstName(parts[0] || null);
          setLastName(parts.slice(1).join(" ") || null);
        } else {
          const local = (user.email || "").split("@")[0];
          setFirstName(local ? local : null);
          setLastName(null);
        }
      } catch (e) {
        console.warn("Profile load failed:", e);
      }
    });
    return () => unsub();
  }, []);

  const fullName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    (firstName || lastName) ||
    "";

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

  const buttons = [
    {
      icon: "people" as const,
      label: "Users",
      route: "./usersScreen",
    },
    {
      icon: "person-circle" as const,
      label: "Profile",
      route: "./profileScreen",
    },
    {
      icon: "settings" as const,
      label: "Settings",
      route: "./settingsScreen",
    },
  ];

  return (
    <ImageBackground source={require("../../assets/images/homeBackground.png")} style={styles.background} resizeMode="cover">
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.overlay}>
          <View>
            <Text style={styles.hello}>Hello{fullName ? `, ${fullName}` : ","}</Text>
            <Text style={styles.date}>{formattedDate}</Text>
          </View>

          <View style={styles.bottomSection}>
            <Text style={styles.status}>
              Status: <Text style={{ color: "white" }}>Online</Text>
            </Text>

            <View style={styles.grid}>
              {buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.button}
                  onPress={() => router.push(button.route as any)}
                >
                  <Ionicons name={button.icon} size={28} color="#ccff00" />
                  <Text style={styles.buttonText}>{button.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: "100%", height: "100%" },
  scrollContainer: { flexGrow: 1 },
  overlay: { flex: 1, paddingTop: 60, paddingHorizontal: 24, paddingBottom: 40, justifyContent: "space-between" },

  hello: { marginTop: 20, fontSize: 32, fontWeight: "400", color: "#f2f2f2ff" },
  date: { fontSize: 32, fontWeight: "500", color: "#ccff00", marginBottom: 12 },

  bottomSection: { marginTop: 20 },
  status: { fontSize: 18, color: "#ffffffff", marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  button: {
    width: "32%",
    height: 90,
    backgroundColor: "rgba(47, 66, 51, 0.9)",
    borderRadius: 20,
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { marginTop: 6, fontSize: 18, color: "#ffffffff" },
});