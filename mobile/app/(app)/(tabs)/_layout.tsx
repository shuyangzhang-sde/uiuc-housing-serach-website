import { Tabs } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { palette } from "../../../src/components/ui"
import { typography, fontFamilies } from "../../../src/components/typography"

export default function SearchTabs() {
  return <Tabs initialRouteName="index" backBehavior="history" screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: palette.accent,
    tabBarInactiveTintColor: palette.muted,
    tabBarStyle: { backgroundColor: palette.background, borderTopColor: palette.line },
    tabBarLabelStyle: { ...typography.caption, fontFamily: fontFamilies.medium },
  }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home tab", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} color={color} size={21} /> }} />
    <Tabs.Screen name="browse" options={{ title: "Browse", tabBarAccessibilityLabel: "Browse tab", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "grid" : "grid-outline"} color={color} size={21} /> }} />
    <Tabs.Screen name="map" options={{ title: "Map", tabBarAccessibilityLabel: "Map tab", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "map" : "map-outline"} color={color} size={21} /> }} />
  </Tabs>
}
