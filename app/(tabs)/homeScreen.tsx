// app/(tabs)/home.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function HomeScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // No hard redirect. Let Login handle navigation into tabs.
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
          // fallback: derive from email (before the @)
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

  // ...rest of your component (unchanged UI)
  // Replace the greeting line to include the name when available:
  // <Text style={styles.hello}>Hello{fullName ? `, ${fullName}` : ","}</Text>

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

  return (
    <ImageBackground source={require("../../assets/images/homeBackground.png")} style={styles.background} resizeMode="cover">
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.overlay}>
          <View>
            <Text style={styles.hello}>Hello{fullName ? `, ${fullName}` : ","}</Text>
            <Text style={styles.date}>{formattedDate}</Text>

          </View>

          {/* Status + Buttons pinned to bottom */}
          <View style={styles.bottomSection}>
            <Text style={styles.status}>
              Status: <Text style={{ color: "white" }}>online</Text>
            </Text>

            <View style={styles.grid}>
              <TouchableOpacity style={styles.button} onPress={() => router.push("./recordScreen")}>
                <Ionicons name="radio-button-on" size={28} color="#ccff00" />
                <Text style={styles.buttonText}>recording</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.button} onPress={() => router.push("./historyScreen")}>
                <Ionicons name="bookmark" size={28} color="#ccff00" />
                <Text style={styles.buttonText}>history</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.button}>
                <Ionicons name="map" size={28} color="#ccff00" />
                <Text style={styles.buttonText}>map</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.button}>
                <Ionicons name="time" size={28} color="#ccff00" />
                <Text style={styles.buttonText}>submits</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.button}>
                <Ionicons name="person-circle" size={28} color="#ccff00" />
                <Text style={styles.buttonText}>profile</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.button}>
                <Ionicons name="settings" size={28} color="#ccff00" />
                <Text style={styles.buttonText}>settings</Text>
              </TouchableOpacity>
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
  hello: { marginTop: 20, fontSize: 32, fontWeight: "400", color: "white" },
  date: { fontSize: 32, fontWeight: "400", color: "#ccff00", marginBottom: 20 },
  bottomSection: { marginTop: 20 },
  status: { fontSize: 18, color: "#ddd", marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  button: {
    width: "32.5%",
    height: 90,
    backgroundColor: "rgba(47, 66, 51, 0.9)",
    borderRadius: 20,
    marginBottom: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { marginTop: 6, fontSize: 18, color: "#a0a0a0" },
});
