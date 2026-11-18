import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, KeyboardAvoidingView, Platform, type TextInputProps, TextInput } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import type { PropsWithChildren } from "react"
import { typography, fontFamilies } from "./typography"

export const palette = {
  background: "#FFFFFF", ink: "#111214", green: "#111214", pink: "#FFB800",
  surface: "#FFFFFF", line: "#E5E5E2", soft: "#F5F5F2", selection: "#FFE4E7",
  muted: "#6D717A", accent: "#111214", yellow: "#FFB800", coral: "#FF5B65",
}
export function AppBackground() {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]} />
}
export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.safe}><AppBackground /><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.column}>{children}</View></ScrollView></KeyboardAvoidingView></SafeAreaView>
}
export function Button({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || pressed) && { opacity: 0.55 }]}><Text style={[styles.buttonText, secondary && { color: palette.ink }]}>{label}</Text></Pressable>
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={palette.muted} {...props} style={[styles.input, props.style]} /></View>
}
export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null
}
export function MessageScreen({ title, message, loading = false }: { title: string; message: string; loading?: boolean }) {
  return <Screen><Text style={styles.brand}>IlliniRent</Text><Text style={styles.title}>{title}</Text><Text style={styles.body}>{message}</Text>{loading && <ActivityIndicator accessibilityLabel="Loading session" color={palette.green} />}</Screen>
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  column: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 18, paddingVertical: 24 },
  brand: { color: palette.ink, ...typography.brand, letterSpacing: 0.5 },
  title: { ...typography.title, color: palette.ink },
  body: { ...typography.body, color: palette.ink },
  label: { ...typography.caption, fontFamily: fontFamilies.medium, color: palette.ink },
  field: { gap: 8 },
  input: { minHeight: 52, padding: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 12, backgroundColor: palette.surface, color: palette.ink, ...typography.input },
  button: { minHeight: 50, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: palette.accent, backgroundColor: palette.accent, alignItems: "center", justifyContent: "center" },
  secondary: { backgroundColor: palette.soft, borderColor: palette.soft },
  buttonText: { color: palette.background, ...typography.body, fontFamily: fontFamilies.medium },
  error: { color: "#A82424", ...typography.body },
  card: { padding: 18, borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, gap: 8 },
})
