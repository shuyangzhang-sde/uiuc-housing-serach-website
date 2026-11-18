import { memo, useState } from "react"
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { availabilityStatus, bedsLabel, httpUrl, listingPrice, type Listing } from "@illirent/core"
import { palette } from "../components/ui"
import { typography, fontFamilies } from "../components/typography"

export function ListingPhoto({ listing, height = 176 }: { listing: Listing; height?: number }) {
  const uri = httpUrl(listing.photo_url)
  const [failed, setFailed] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(uri)
  return <View style={[card.photo, { height }]}>
    {!uri || failed === uri ? <Text style={card.placeholder}>{uri ? "Photo unavailable" : "No photo available"}</Text> : <>
      <Image source={{ uri }} accessibilityLabel={`Photo of ${listing.address}`} style={StyleSheet.absoluteFill} resizeMode="cover" onLoadStart={() => setLoading(uri)} onLoadEnd={() => setLoading(null)} onError={() => setFailed(uri)} />
      {loading === uri && <ActivityIndicator accessibilityLabel="Loading property photo" color={palette.green} />}
    </>}
  </View>
}
export function AvailabilityBadge({ listing, compact = false }: { listing: Listing; compact?: boolean }) {
  const status = availabilityStatus(listing.availability)
  return <View style={[card.badge, compact && card.compactBadge, { backgroundColor: status === "now" ? palette.ink : status === "available" ? palette.pink : palette.soft }]}><Text style={[card.badgeText, status === "now" && { color: palette.background }]}>{listing.availability || "Ask about availability"}</Text></View>
}
export const ListingCard = memo(function ListingCard({ listing, onPress, style }: { listing: Listing; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const price = listingPrice(listing)
  const notePreview = /scrap|manual price search/i.test(listing.price_note) ? "Ask the property manager for current rates." : price.text
  const [noteExpanded, setNoteExpanded] = useState(false)
  const specifications = [...new Map(
    [listing.unit_type, bedsLabel(listing.beds, listing.unit_type), listing.property_type]
      .map(value => value.trim()).filter(Boolean).map(value => [value.toLowerCase(), value]),
  ).values()].join(" · ")
  return <View style={[card.container, style]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${listing.address}. ${listing.company}. ${specifications}. ${listing.availability}`} accessibilityHint="Opens property details" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <View style={card.imageFrame}>
        <ListingPhoto listing={listing} height={128} />
        <View style={card.photoBadge}><AvailabilityBadge listing={listing} compact /></View>
      </View>
      <View style={card.content}>
        <Text style={card.company}>{listing.company}</Text>
        <Text style={card.address}>{listing.address}</Text>
        {!!specifications && <Text style={card.specifications}>{specifications}</Text>}
      </View>
    </Pressable>
    <View style={card.footer}>
      {listing.price_note ? <View style={card.note}>
        <Text style={card.noteText} numberOfLines={noteExpanded ? undefined : 2}>{noteExpanded ? price.text : notePreview}</Text>
        <View style={card.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={noteExpanded ? "Collapse pricing note" : "Read full pricing note"} accessibilityState={{ expanded: noteExpanded }} onPress={() => setNoteExpanded(value => !value)} style={card.noteAction}>
            <Text style={card.noteLink}>{noteExpanded ? "Less ↑" : "Pricing details ↓"}</Text>
          </Pressable>
          <PropertyAction address={listing.address} onPress={onPress} />
        </View>
      </View> : <View style={card.priceRow}>
        <View style={card.priceBlock}><Text style={card.price}>{price.text}</Text><Text style={card.company}>{price.caption}</Text></View>
        <PropertyAction address={listing.address} onPress={onPress} />
      </View>}
    </View>
  </View>
})
function PropertyAction({ address, onPress }: { address: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View property at ${address}`} onPress={onPress} style={({ pressed }) => [card.propertyAction, pressed && { opacity: 0.65 }]}><View style={card.propertyButton}><Text style={card.details}>Explore home →</Text></View></Pressable>
}
const card = StyleSheet.create({
  container: { backgroundColor: palette.surface, borderRadius: 12, flex: 1, borderWidth: 1, borderColor: palette.line },
  imageFrame: { margin: 6, marginBottom: 0, borderRadius: 9, overflow: "hidden" },
  photo: { backgroundColor: palette.soft, alignItems: "center", justifyContent: "center" },
  photoBadge: { position: "absolute", bottom: 10, left: 12, right: 12 },
  placeholder: { color: palette.ink, ...typography.control },
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 4 },
  badge: { padding: 8, borderRadius: 9, alignSelf: "flex-start", maxWidth: "100%" },
  compactBadge: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 9 },
  badgeText: { color: palette.ink, ...typography.badge },
  company: { color: palette.muted, ...typography.caption },
  address: { color: palette.ink, ...typography.cardTitle },
  specifications: { color: palette.muted, ...typography.control },
  footer: { marginHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderColor: palette.line },
  priceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 10, rowGap: 4 },
  priceBlock: { flexGrow: 1, flexShrink: 1, minWidth: 140 },
  price: { color: palette.ink, ...typography.cardTitle, fontFamily: fontFamilies.semibold },
  note: { gap: 2 },
  noteText: { color: palette.muted, ...typography.caption },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12 },
  noteAction: { minHeight: 44, justifyContent: "center", paddingRight: 8 },
  noteLink: { color: palette.accent, ...typography.caption, fontFamily: fontFamilies.medium },
  propertyAction: { minHeight: 44, justifyContent: "center" },
  propertyButton: { minHeight: 32, paddingVertical: 6, paddingHorizontal: 12, justifyContent: "center", backgroundColor: palette.ink, borderRadius: 16 },
  details: { color: palette.background, ...typography.control },
})
