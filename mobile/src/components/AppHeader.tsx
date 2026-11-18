import Ionicons from "@expo/vector-icons/Ionicons"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "../auth/AuthProvider"
import { AppBackground, Button, ErrorText, palette, styles } from "./ui"
import { typography, fontFamilies } from "./typography"

export function AppHeader({ caption }: { caption?: string }) {
  return <View style={chrome.bar}>
    <View style={chrome.brandGroup}>
      <View style={chrome.brandRow}><View style={chrome.brandMark}><Ionicons name="home" size={13} color={palette.ink} /></View><Text accessibilityRole="header" style={chrome.brand}>ILLINIRENT</Text></View>
      {!!caption && <Text style={chrome.caption}>{caption}</Text>}
    </View>
    <AccountMenu />
  </View>
}
function AccountMenu() {
  const { session, signOut } = useAuth()
  const router = useRouter()
  const [accountOpen, setAccountOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => setAccountOpen(true)} style={chrome.account}><Ionicons name="person-outline" size={20} color={palette.background} /></Pressable>
    <Modal visible={accountOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAccountOpen(false)}><SafeAreaView style={styles.safe}><AppBackground /><View style={chrome.accountContent}><Text accessibilityRole="header" style={styles.title}>Your account</Text><Text style={styles.body}>{session?.user.email}</Text><ErrorText message={logoutError} /><Button label={logoutBusy ? "Signing out…" : "Log out"} disabled={logoutBusy} onPress={() => { setLogoutBusy(true); setLogoutError(null); void signOut().catch(() => setLogoutError("Could not clear the saved session. Please retry.")).finally(() => setLogoutBusy(false)) }} />{process.env.EXPO_PUBLIC_APP_ENV === "preview" || __DEV__ ? <Button secondary label="Beta diagnostics" onPress={() => { setAccountOpen(false); router.push("/diagnostics") }} /> : null}<Button secondary label="Done" disabled={logoutBusy} onPress={() => setAccountOpen(false)} /></View></SafeAreaView></Modal>
  </>
}
const chrome = StyleSheet.create({
  bar: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brandGroup: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 2 },
  caption: { color: palette.muted, ...typography.caption },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  brandMark: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.yellow, alignItems: "center", justifyContent: "center" },
  brand: { color: palette.ink, ...typography.caption, fontFamily: fontFamilies.bold, letterSpacing: 0.8 },
  account: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.ink, alignItems: "center", justifyContent: "center" },
  accountContent: { padding: 24, gap: 20, maxWidth: 560, width: "100%", alignSelf: "center" },
})
