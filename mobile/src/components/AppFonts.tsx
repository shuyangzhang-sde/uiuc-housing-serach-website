import Ionicons from "@expo/vector-icons/Ionicons"
import { useState, type PropsWithChildren } from "react"
import { useFonts } from "expo-font"
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native"
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular"
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium"
import { Caveat_500Medium } from "@expo-google-fonts/caveat/500Medium"
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold"
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold"

export const appFonts = { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Caveat_500Medium, ...Ionicons.font }

/** Hold branded text until local assets load; a failed load can retry without touching auth. */
export function AppFonts({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0)
  return <FontAttempt key={attempt} retry={() => setAttempt(value => value + 1)}>{children}</FontAttempt>
}
function FontAttempt({ children, retry }: PropsWithChildren<{ retry: () => void }>) {
  const [ready, error] = useFonts(appFonts)
  if (ready) return children
  return <View style={loading.screen}>
    {error ? <>
      <Text style={loading.title}>Let’s reopen IlliniRent</Text>
      <Text style={loading.body}>The app’s fonts could not load. Please retry.</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={loading.button}><Text style={loading.body}>Retry</Text></Pressable>
    </> : <ActivityIndicator accessibilityLabel="Preparing IlliniRent" color="#111214" />}
  </View>
}
const loading = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 20, color: "#111214" },
  body: { fontSize: 14, color: "#111214", textAlign: "center" },
  button: { minWidth: 100, minHeight: 44, padding: 12, borderWidth: 1, borderColor: "#E5E5E2", borderRadius: 14, justifyContent: "center" },
})
