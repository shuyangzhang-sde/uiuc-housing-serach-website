import { Stack } from "expo-router"
import { BrowseProvider } from "../../src/browse/BrowseProvider"
import { useAuth } from "../../src/auth/AuthProvider"

export default function AppLayout() {
  const { session } = useAuth()
  return <BrowseProvider key={session?.user.id}><Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }} /></BrowseProvider>
}
