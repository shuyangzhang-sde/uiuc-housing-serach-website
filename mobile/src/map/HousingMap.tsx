import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native"
import { Camera, GeoJSONSource, Images, Layer, Map as NativeMap, type CameraRef, type GeoJSONSourceRef, type GeoJSONSourceProps } from "@maplibre/maplibre-react-native"
import { LANDMARKS } from "@illirent/core"
import { palette } from "../components/ui"
import { typography } from "../components/typography"
import { CAMPUS_CENTER, CAMPUS_ZOOM, locationBounds, type buildMapData } from "./data"

const PIN_IMAGES = {
  "price-available": require("../../assets/map/price-available.png"),
  "price-unavailable": require("../../assets/map/price-unavailable.png"),
  "price-selected": require("../../assets/map/price-selected.png"),
}
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron"
const landmarks: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection", features: LANDMARKS.map(landmark => ({ type: "Feature", geometry: { type: "Point", coordinates: [landmark.lng, landmark.lat] }, properties: { name: landmark.name } })),
}
export function HousingMap({ data, searchKey, selectedId, onSelect, loading, fitOnSearch }: {
  data: ReturnType<typeof buildMapData>; searchKey: string; selectedId: string | null; onSelect: (id: string | null) => void; loading: boolean; fitOnSearch: boolean
}) {
  const camera = useRef<CameraRef>(null)
  const source = useRef<GeoJSONSourceRef>(null)
  const currentZoom = useRef(CAMPUS_ZOOM)
  const lastFit = useRef<string | null>(null)
  const currentSearch = useRef(searchKey)
  currentSearch.current = searchKey
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const bounds = useMemo(() => locationBounds(data.groups), [data.groups])
  const fitResults = useCallback(() => {
    if (bounds) camera.current?.fitBounds(bounds, { padding: { top: 55, right: 55, bottom: 55, left: 55 }, duration: 450 })
    else camera.current?.flyTo({ center: CAMPUS_CENTER, zoom: CAMPUS_ZOOM, duration: 450 })
  }, [bounds])
  useEffect(() => {
    if (ready && !loading && lastFit.current !== searchKey) {
      if (fitOnSearch) fitResults()
      else camera.current?.flyTo({ center: CAMPUS_CENTER, zoom: CAMPUS_ZOOM, duration: 300 })
      lastFit.current = searchKey
    }
    // Fit once per applied search, not whenever a background refresh changes prices.
  }, [ready, searchKey, fitResults, loading, fitOnSearch])
  const onPinPress: NonNullable<GeoJSONSourceProps["onPress"]> = event => {
    event.stopPropagation()
    const feature = event.nativeEvent.features[0]
    if (!feature || feature.geometry.type !== "Point") return
    const { properties } = feature
    if (properties?.cluster && typeof properties.cluster_id === "number") {
      const center = feature.geometry.coordinates as [number, number]
      const clusterId = properties.cluster_id
      const pressedSearch = searchKey
      void source.current?.getClusterExpansionZoom(clusterId).then(zoom => {
        if (currentSearch.current === pressedSearch) camera.current?.flyTo({ center, zoom: Math.min(19, zoom + 0.2), duration: 450 })
      }).catch(() => {
        if (currentSearch.current === pressedSearch) camera.current?.flyTo({ center, zoom: Math.min(19, currentZoom.current + 2), duration: 450 })
      })
      return
    }
    if (typeof properties?.locationId === "string" && data.locations.has(properties.locationId)) onSelect(properties.locationId)
  }
  return <View style={mapStyles.container}>
    <NativeMap key={attempt} testID="housing-map" accessibilityLabel="Housing map around the University of Illinois campus" mapStyle={MAP_STYLE}
      style={StyleSheet.absoluteFill} attribution logo={false} tintColor={palette.ink}
      attributionPosition={{ bottom: 8, right: 8 }} compassPosition={{ bottom: 8, left: 8 }}
      onDidFinishLoadingStyle={() => { setReady(true); setMapError(false) }} onDidFailLoadingMap={() => { setMapError(true); setReady(false) }}
      onRegionDidChange={event => { currentZoom.current = event.nativeEvent.zoom }} onPress={() => onSelect(null)}>
      <Images images={PIN_IMAGES} />
      <Camera ref={camera} initialViewState={{ center: CAMPUS_CENTER, zoom: CAMPUS_ZOOM }} minZoom={8} maxZoom={19} />
      <GeoJSONSource ref={source} id="housing-locations" data={data.geojson} cluster clusterRadius={45} clusterMaxZoom={15} onPress={onPinPress}>
        <Layer key="housing-clusters" id="housing-clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": palette.ink, "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 24], "circle-stroke-color": palette.background, "circle-stroke-width": 2 }} />
        <Layer key="housing-cluster-count" id="housing-cluster-count" type="symbol" filter={["has", "point_count"]} layout={{ "text-field": ["to-string", ["get", "point_count_abbreviated"]], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-allow-overlap": true }} paint={{ "text-color": palette.background }} />
        <Layer key="housing-prices" id="housing-prices" type="symbol" filter={["!", ["has", "point_count"]]} layout={{
          "icon-image": ["case", ["==", ["get", "locationId"], selectedId ?? ""], "price-selected", ["get", "available"], "price-available", "price-unavailable"],
          "icon-text-fit": "both", "icon-text-fit-padding": [5, 9, 5, 9],
          "icon-allow-overlap": false, "text-allow-overlap": false,
          "symbol-sort-key": ["case", ["==", ["get", "locationId"], selectedId ?? ""], -1, ["get", "available"], 0, 1],
          "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-padding": 3,
        }} paint={{ "text-color": ["case", ["==", ["get", "locationId"], selectedId ?? ""], palette.ink, ["get", "available"], palette.background, palette.ink] }} />
      </GeoJSONSource>
      <GeoJSONSource id="campus-landmarks" data={landmarks}>
        <Layer key="campus-points" id="campus-points" type="circle" minzoom={13} paint={{ "circle-color": palette.pink, "circle-radius": 4, "circle-stroke-color": palette.ink, "circle-stroke-width": 1 }} />
        <Layer key="campus-labels" id="campus-labels" type="symbol" minzoom={14} layout={{ "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-offset": [0, 1.2], "text-anchor": "top", "text-max-width": 12 }} paint={{ "text-color": palette.ink, "text-halo-color": palette.background, "text-halo-width": 1.5 }} />
      </GeoJSONSource>
    </NativeMap>
    {!ready && !mapError && <View pointerEvents="none" style={mapStyles.notice}><ActivityIndicator color={palette.ink} /><Text style={mapStyles.small}>Loading map…</Text></View>}
    {mapError && <View style={mapStyles.error}><Text style={mapStyles.small}>Map tiles could not load. You can still browse the same listings.</Text><Pressable accessibilityRole="button" onPress={() => { setMapError(false); setReady(false); lastFit.current = null; setAttempt(value => value + 1) }} style={mapStyles.action}><Text style={mapStyles.actionText}>Retry map</Text></Pressable></View>}
    {!mapError && <>
      <View pointerEvents="none" style={mapStyles.legend}><Text style={mapStyles.small}>{loading ? "Finding locations…" : `${data.groups.length.toLocaleString()} locations · tap a cluster to explore`}</Text></View>
      <View style={mapStyles.controls}>
        <MapControl label="Fit all filtered locations" text="Fit" onPress={fitResults} />
        <MapControl label="Center map on campus" text="UIUC" onPress={() => camera.current?.flyTo({ center: CAMPUS_CENTER, zoom: CAMPUS_ZOOM, duration: 450 })} />
        <MapControl label="Zoom in" text="+" onPress={() => camera.current?.zoomTo(Math.min(19, currentZoom.current + 1), { duration: 250 })} />
        <MapControl label="Zoom out" text="−" onPress={() => camera.current?.zoomTo(Math.max(8, currentZoom.current - 1), { duration: 250 })} />
      </View>
    </>}
  </View>
}
function MapControl({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={mapStyles.control}><Text style={mapStyles.actionText}>{text}</Text></Pressable>
}
const mapStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E5E3DB", minHeight: 150 },
  controls: { position: "absolute", top: 48, right: 10, gap: 6 },
  control: { backgroundColor: palette.background, borderRadius: 14, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderColor: palette.line, borderWidth: 1 },
  action: { padding: 12, minHeight: 44, justifyContent: "center" },
  actionText: { ...typography.control, color: palette.ink },
  legend: { position: "absolute", top: 8, left: 8, backgroundColor: palette.background, padding: 8, borderRadius: 14 },
  small: { ...typography.caption, color: palette.ink },
  notice: { position: "absolute", top: 48, left: 8, flexDirection: "row", gap: 8, alignItems: "center", padding: 10, borderRadius: 14, backgroundColor: palette.background },
  error: { position: "absolute", top: 12, left: 12, right: 12, gap: 8, padding: 12, backgroundColor: palette.background, borderRadius: 14 },
})
