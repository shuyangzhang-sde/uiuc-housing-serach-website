import { useEffect, useState, type PropsWithChildren } from "react"
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { palette } from "../components/ui"
import { typography, fontFamilies } from "../components/typography"

export interface DropdownAnchor { x: number; y: number; width: number; height: number }

/** A bounded popover over the existing results, positioned beside its toolbar chip. */
export function Dropdown({ anchor, title, onClose, children, footer, width = 340 }: PropsWithChildren<{
  anchor: DropdownAnchor; title: string; onClose: () => void; footer?: React.ReactNode; width?: number
}>) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null)
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", event => setKeyboardTop(event.endCoordinates.screenY))
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardTop(null))
    return () => { show.remove(); hide.remove() }
  }, [])
  const panelWidth = Math.min(width, window.width - 24)
  const bottom = Math.min(window.height - insets.bottom, keyboardTop ?? window.height) - 12
  const top = Math.max(insets.top + 8, Math.min(anchor.y + anchor.height + 6, bottom - 170))
  const left = Math.max(12, Math.min(anchor.x, window.width - panelWidth - 12))
  return <Modal transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={onClose}>
    <View style={StyleSheet.absoluteFill}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss dropdown" onPress={onClose} style={dropdown.backdrop} />
      <View accessibilityViewIsModal style={[dropdown.panel, { top, left, width: panelWidth, maxHeight: Math.max(120, Math.min(460, bottom - top)) }]}>
        <View style={dropdown.header}><Text accessibilityRole="header" style={dropdown.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close dropdown" hitSlop={4} onPress={onClose} style={dropdown.close}><Text style={dropdown.closeText}>✕</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={dropdown.content}>{children}</ScrollView>
        {footer && <View style={dropdown.footer}>{footer}</View>}
      </View>
    </View>
  </Modal>
}
export function DropdownChoice({ label, selected, onPress, group, multiple = false }: {
  label: string; selected: boolean; onPress: () => void; group: string; multiple?: boolean
}) {
  return <Pressable accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityLabel={`${group}: ${label}`} accessibilityState={{ checked: selected }} onPress={onPress} style={[dropdown.option, selected && dropdown.selected]}><Text style={dropdown.optionText}>{label}</Text><Text style={dropdown.check}>{selected ? "✓" : ""}</Text></Pressable>
}
const dropdown = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(53,20,11,0.12)" },
  panel: { position: "absolute", backgroundColor: palette.surface, borderRadius: 14, borderWidth: 1, borderColor: palette.line, shadowColor: "#35140B", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 8, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 6, paddingVertical: 3 },
  title: { ...typography.body, fontFamily: fontFamilies.medium, color: palette.ink, flex: 1 },
  close: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  closeText: { color: palette.ink, ...typography.section },
  content: { paddingHorizontal: 10, paddingBottom: 10, gap: 4 },
  option: { minHeight: 44, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  selected: { backgroundColor: "#FFF0BC" },
  optionText: { color: palette.ink, ...typography.control, flex: 1 },
  check: { color: palette.accent, ...typography.body, fontFamily: fontFamilies.medium, width: 18 },
  footer: { padding: 10, borderTopWidth: 1, borderTopColor: palette.line, gap: 8 },
})
