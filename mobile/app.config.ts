import type { ExpoConfig } from "expo/config"

const production = process.env.APP_VARIANT === "production"
const config: ExpoConfig = {
  name: production ? "IlliniRent" : "IlliniRent Dev",
  slug: "illinirent",
  scheme: production ? "illinirent" : "illinirent-dev",
  version: "0.1.0",
  extra: { ...(process.env.EXPO_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PROJECT_ID } } : {}) },
  orientation: "default",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: production ? "com.illinirent.app" : "com.illinirent.app.dev",
    supportsTablet: true,
    buildNumber: "1",
    infoPlist: { ITSAppUsesNonExemptEncryption: false, ...(!production ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } } : {}) },
  },
  android: { versionCode: 1, package: production ? "com.illinirent.app" : "com.illinirent.app.dev" },
  plugins: [["@sentry/react-native/expo", { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }], "@maplibre/maplibre-react-native", "expo-router", "expo-secure-store", ["expo-build-properties", { android: { usesCleartextTraffic: !production } }]],
}
export default config
