// app/(tabs)/home.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function HomeScreen() {
  const router = useRouter();

  // Get today’s date
  const today = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  };
  const formattedDate = today.toLocaleDateString("en-US", options);

  return (
    <ImageBackground
      source={require("../../assets/images/homeBackground.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.overlay}>
          {/* Greeting at top */}
          <View>
            <Text style={styles.hello}>Hello,</Text>
            <Text style={styles.date}>{formattedDate}</Text>
          </View>

          {/* Status + Buttons pinned to bottom */}
          <View style={styles.bottomSection}>
            <Text style={styles.status}>
              Status: <Text style={{ color: "white" }}>online</Text>
            </Text>

            <View style={styles.grid}>
              <TouchableOpacity
                style={styles.button}
                onPress={() => router.push("/recordScreen")}
              >
                <Ionicons name="radio-button-on" size={28} color="#ccff00" />
                <Text style={styles.buttonText}>recording</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.button}>
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
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  scrollContainer: {
    flexGrow: 1, // allow ScrollView to expand
  },
  overlay: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: "space-between", // pushes bottomSection down
  },
  hello: {
    fontSize: 32,
    fontWeight: "400",
    color: "white",
  },
  date: {
    fontSize: 32,
    fontWeight: "600",
    color: "#ccff00",
    marginBottom: 20,
  },
  bottomSection: {
    marginTop: 20,
  },
  status: {
    fontSize: 18,
    color: "#ddd",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  button: {
    width: "32.5%",
    height: 90,
    backgroundColor: "rgba(47, 66, 51, 0.9)",
    borderRadius: 20,
    marginBottom: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    marginTop: 6,
    fontSize: 18,
    color: "#a0a0a0",
  },
});
