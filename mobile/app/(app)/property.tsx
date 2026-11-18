import { useScreenAnalytics } from "../../src/telemetry/useScreenAnalytics"
import { useAuth } from "../../src/auth/AuthProvider"
import { useState } from "react"
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { bedsLabel, httpUrl, priceRangeText } from "@illirent/core"
import { useBrowse } from "../../src/browse/BrowseProvider"
import { AvailabilityBadge, ListingPhoto } from "../../src/browse/ListingCard"
import { Button, ErrorText, AppBackground, palette, styles } from "../../src/components/ui"
import { typography, fontFamilies } from "../../src/components/typography"

export default function PropertyDetails() {
  useScreenAnalytics("listing_view")
  const { analytics } = useAuth()
  const { selected: listing } = useBrowse()
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const backLabel = from === "map" ? "Back to map" : "Back to listings"
  const [linkError, setLinkError] = useState<string | null>(null)
  function back() { if (router.canGoBack()) router.back(); else router.replace(from === "map" ? "/map" : "/browse") }
  async function openLink(value: string) {
    const url = httpUrl(value)
    if (!url) { setLinkError("This link is unavailable. Please try the property manager’s website."); return }
    setLinkError(null)
    try { await Linking.openURL(url); void analytics.track("source_open", { source: value === listing?.brochure_url ? "brochure" : "listing" }) } catch { setLinkError("Could not open this link. Please try again.") }
  }
  if (!listing) return <SafeAreaView style={styles.safe}><View style={details.content}><Text style={styles.title}>Choose a property</Text><Text style={styles.body}>Return to listings to open a property’s details.</Text><Button label={backLabel} onPress={back} /></View></SafeAreaView>
  const amenities = [...new Set(listing.amenities.split(",").map(value => value.trim()).filter(Boolean))]
  return <SafeAreaView style={styles.safe}><AppBackground />
    <View style={details.nav}><Button secondary label={`← ${backLabel}`} onPress={back} /></View>
    <ScrollView contentContainerStyle={details.scroll}>
      <ListingPhoto listing={listing} height={260} />
      <View style={details.content}>
        <Text style={styles.brand}>{listing.company}</Text>
        <AvailabilityBadge listing={listing} />
        <Text accessibilityRole="header" style={styles.title}>{listing.address}</Text>
        <Text style={styles.body}>{[listing.unit_type, bedsLabel(listing.beds, listing.unit_type), listing.property_type, listing.area].filter(Boolean).join(" · ")}</Text>
        {!!listing.tagline && <Text style={[styles.body, { color: palette.green, fontFamily: fontFamilies.medium }]}>{listing.tagline}</Text>}
        <Section title="Monthly pricing">
          {listing.price_note ? <Text style={styles.body}>{listing.price_note}</Text> : <>
            <Text style={styles.body}>Per bed: {listing.price_per_bed_low == null ? "Not published" : priceRangeText(listing.price_per_bed_low, listing.price_per_bed_high)}</Text>
            <Text style={styles.body}>Total: {listing.price_total_low == null ? "Not published" : priceRangeText(listing.price_total_low, listing.price_total_high)}</Text>
          </>}
        </Section>
        {!!listing.availability_summary && <Section title="Availability"><Text style={styles.body}>{listing.availability_summary}</Text></Section>}
        {!!listing.description && <Section title="About this property"><Text selectable style={styles.body}>{listing.description}</Text></Section>}
        {amenities.length > 0 && <Section title="Amenities"><View style={details.tags}>{amenities.map(amenity => <View key={amenity} style={details.tag}><Text style={details.tagText}>{amenity}</Text></View>)}</View></Section>}
        {!!(listing.lease_dates || listing.utility_fees) && <Section title="Lease information">{!!listing.lease_dates && <Text style={styles.body}>Lease dates: {listing.lease_dates}</Text>}{!!listing.utility_fees && <Text style={styles.body}>Utilities: {listing.utility_fees}</Text>}</Section>}
        <Text style={details.note}>Confirm current pricing, availability, and lease terms with the property manager.</Text>
        <ErrorText message={linkError} />
        {httpUrl(listing.url) ? <Button label="View original listing ↗" onPress={() => { void openLink(listing.url) }} /> : <Text style={styles.body}>Original listing link unavailable.</Text>}
        {!!httpUrl(listing.brochure_url) && <Button secondary label="Open brochure PDF ↗" onPress={() => { void openLink(listing.brochure_url) }} />}
      </View>
    </ScrollView>
  </SafeAreaView>
}
function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <View style={details.section}><Text accessibilityRole="header" style={details.heading}>{title}</Text>{children}</View>
}
const details = StyleSheet.create({
  nav: { paddingHorizontal: 16, paddingVertical: 8, alignItems: "flex-start", maxWidth: 800, width: "100%", alignSelf: "center" },
  scroll: { paddingBottom: 24, maxWidth: 800, width: "100%", alignSelf: "center" },
  content: { padding: 24, gap: 20 },
  section: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderColor: palette.line },
  heading: { color: palette.ink, ...typography.section },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.soft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, maxWidth: "100%" },
  tagText: { color: palette.ink, ...typography.control, fontFamily: fontFamilies.regular },
  note: { ...typography.caption, color: palette.muted },
})
