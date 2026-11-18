// Static Inter faces are bundled locally; no runtime font download or synthetic bold.
export const fontFamilies = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  handwritten: "Caveat_500Medium",
} as const

// Keep the compact hierarchy and native text scaling across every app screen.
export const typography = {
  title: { fontFamily: fontFamilies.bold, fontSize: 26, lineHeight: 32 },
  handwritten: { fontFamily: fontFamilies.handwritten, fontSize: 23, lineHeight: 27 },
  hero: { fontFamily: fontFamilies.bold, fontSize: 27, lineHeight: 30, letterSpacing: -0.7 },
  compactTitle: { fontFamily: fontFamilies.medium, fontSize: 20, lineHeight: 26 },
  emptyTitle: { fontFamily: fontFamilies.medium, fontSize: 20, lineHeight: 26 },
  cardTitle: { fontFamily: fontFamilies.medium, fontSize: 18, lineHeight: 24 },
  section: { fontFamily: fontFamilies.medium, fontSize: 16, lineHeight: 22 },
  brand: { fontFamily: fontFamilies.medium, fontSize: 17, lineHeight: 23 },
  price: { fontFamily: fontFamilies.semibold, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fontFamilies.regular, fontSize: 14, lineHeight: 21 },
  input: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  control: { fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 17 },
  badge: { fontFamily: fontFamilies.medium, fontSize: 11, lineHeight: 16 },
} as const
