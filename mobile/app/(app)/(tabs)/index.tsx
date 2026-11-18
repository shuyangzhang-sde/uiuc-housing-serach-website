import Ionicons from "@expo/vector-icons/Ionicons"
import { useRouter } from "expo-router"
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFilters } from "@illirent/search-state"
import { DEFAULT_SORT, SORT_OPTIONS } from "@illirent/core"
import { useBrowse } from "../../../src/browse/BrowseProvider"
import { AppHeader } from "../../../src/components/AppHeader"
import { AppBackground, palette, styles } from "../../../src/components/ui"
import { typography, fontFamilies } from "../../../src/components/typography"
import { FILTER_CATEGORIES, filterLabel, isFilterActive } from "../../../src/browse/FilterDropdown"
import { useScreenAnalytics } from "../../../src/telemetry/useScreenAnalytics"

export default function HomeScreen() {
  useScreenAnalytics("home_view")
  const router = useRouter()
  const { filters } = useFilters()
  const { sort } = useBrowse()
  const { width, fontScale } = useWindowDimensions()
  const stackHero = width < 375 || fontScale > 1.2
  const summary = [
    ...FILTER_CATEGORIES.filter(item => isFilterActive(item.key, filters)).map(item => filterLabel(item.key, filters)),
    ...(sort !== DEFAULT_SORT ? [`Sort: ${SORT_OPTIONS.find(option => option.key === sort)?.short ?? sort}`] : []),
  ].join(" · ")
  return <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
    <View style={home.chrome}><AppHeader /></View>
    <ScrollView contentContainerStyle={home.content}>
      <AppBackground />
      <View style={[home.hero, stackHero && home.stacked]}>
        <View style={[home.heroText, stackHero && home.stackedText]}>
          <Text style={home.kicker}>Make it yours.</Text>
          <Text accessibilityRole="header" style={home.title}>Find your{"\n"}happy place.</Text>
          <Text style={home.intro}>A place for late-night studying, slow mornings, and your next UIUC chapter.</Text>
        </View>
        <View style={home.artPanel}><Image accessible={false} source={require("../../../assets/illustrations/moving-home.png")} resizeMode="contain" style={home.art} /></View>
      </View>
      <View style={home.location}><Ionicons name="location-outline" size={15} color={palette.muted} /><Text style={home.caption}>CHAMPAIGN + URBANA</Text></View>
      <View style={home.actions}>
        <Text accessibilityRole="header" style={home.sectionTitle}>Where would you like to start?</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Browse homes" accessibilityHint="Opens listings with your current filters" onPress={() => router.navigate("/browse")} style={({ pressed }) => [home.action, home.browseAction, pressed && home.pressed]}>
          <View style={home.actionIcon}><Ionicons name="grid-outline" size={23} color={palette.ink} /></View>
          <View style={home.actionText}><Text style={home.actionTitle}>Browse homes</Text><Text style={home.actionCaption}>Compare rent, bedrooms, and availability.</Text></View>
          <Ionicons name="arrow-forward" size={22} color={palette.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Explore the map" accessibilityHint="Opens the map with your current filters" onPress={() => router.navigate("/map")} style={({ pressed }) => [home.action, home.mapAction, pressed && home.pressed]}>
          <View style={[home.actionIcon, home.mapIcon]}><Ionicons name="map-outline" size={23} color={palette.ink} /></View>
          <View style={home.actionText}><Text style={home.actionTitle}>Explore the map</Text><Text style={home.actionCaption}>Find your corner of campus.</Text></View>
          <Ionicons name="arrow-forward" size={22} color={palette.ink} />
        </Pressable>
      </View>
      {!!summary && <Pressable accessibilityRole="button" accessibilityLabel="Continue your search" onPress={() => router.navigate("/browse")} style={({ pressed }) => [home.resume, pressed && home.pressed]}>
        <View style={home.actionText}><Text style={home.resumeTitle}>Pick up where you left off</Text><Text style={home.resumeSummary}>{summary}</Text></View><Ionicons name="arrow-forward" size={20} color={palette.ink} />
      </Pressable>}
      <Text style={home.footer}>Your next chapter. Your kind of home.</Text>
    </ScrollView>
  </SafeAreaView>
}
const home = StyleSheet.create({
  chrome: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10, width: "100%", maxWidth: 800, alignSelf: "center" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 20, width: "100%", maxWidth: 800, alignSelf: "center" },
  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  stacked: { flexDirection: "column", alignItems: "stretch" },
  heroText: { flex: 1, gap: 8 },
  stackedText: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  kicker: { color: palette.ink, ...typography.handwritten },
  title: { color: palette.ink, fontFamily: fontFamilies.bold, fontSize: 32, lineHeight: 36, letterSpacing: -0.9 },
  intro: { color: palette.muted, ...typography.body },
  artPanel: { width: 144, height: 180, backgroundColor: palette.coral, alignSelf: "center", justifyContent: "center" },
  art: { width: 144, height: 180 },
  location: { flexDirection: "row", alignItems: "center", gap: 5 },
  caption: { color: palette.muted, ...typography.caption, letterSpacing: 0.5 },
  actions: { gap: 12 },
  sectionTitle: { color: palette.ink, ...typography.section },
  action: { minHeight: 92, padding: 16, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  browseAction: { backgroundColor: palette.yellow },
  mapAction: { backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.line },
  actionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FFD365", alignItems: "center", justifyContent: "center" },
  mapIcon: { backgroundColor: "#FFD6DA" },
  actionText: { flex: 1, gap: 4 },
  actionTitle: { color: palette.ink, ...typography.cardTitle, fontFamily: fontFamilies.semibold },
  actionCaption: { color: palette.ink, ...typography.caption },
  pressed: { opacity: 0.7 },
  resume: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: "row", gap: 12, alignItems: "center", minHeight: 64 },
  resumeTitle: { color: palette.ink, ...typography.control },
  resumeSummary: { color: palette.muted, ...typography.caption },
  footer: { color: palette.muted, ...typography.caption },
})
