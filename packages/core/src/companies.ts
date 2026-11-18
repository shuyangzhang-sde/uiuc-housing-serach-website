// Metadata shared across clients. logoKey is resolved by each platform.
export interface Company {
  name: string
  logoKey: string
}

export const COMPANIES: Company[] = [
  { name: "Green Street Realty",  logoKey: "company-logo-green-street-realty.png" },
  { name: "Universities Group",   logoKey: "company-logo-university-group.png" },
  { name: "Smile Student Living", logoKey: "company-logo-smile.png" },
  { name: "MHM Properties",       logoKey: "company-logo-mhm-properties.png" },
  { name: "Seven07",              logoKey: "company-logo-707.svg" },
  { name: "Bankier Apartments",   logoKey: "company-logo-bankier.png" },
  { name: "Roland Realty",        logoKey: "company-logo-roland.png" },
  { name: "JSJ Property Management", logoKey: "company-logo-jsj.webp" },
]

// Coverage metadata; optional logoKey is resolved by the platform.
export interface ExcludedCompany {
  name: string
  reason: string
  logoKey?: string
  dark?: boolean
}

export const UNSCRAPABLE_COMPANIES: ExcludedCompany[] = [
  { name: "The Dean",      reason: "Site terms prohibit republishing listing data", logoKey: "company-logo-dean.svg" },
  { name: "Hub",           reason: "Site terms prohibit scraping and republishing", logoKey: "company-logo-hub.svg" },
  { name: "309 Green",     reason: "Site terms prohibit scraping and republishing", logoKey: "company-logo-309-green.png", dark: true },
  { name: "The Linc",      reason: "Site terms prohibit republishing listing data", logoKey: "company-logo-the-linc.svg" },
  { name: "Campus Circle", reason: "Bot protection blocks automated access", logoKey: "company-logo-campus-circle.webp", dark: true },
  { name: "Latitude",      reason: "Bot protection blocks automated access", logoKey: "company-logo-latitude.png", dark: true },
  { name: "Burnham 310",   reason: "Pricing sits behind bot protection", logoKey: "company-logo-burnham-310.png" },
]

export const FULLY_LEASED_COMPANIES: ExcludedCompany[] = [
  { name: "JSM", reason: "Fully leased for 2026-27, no unit data published until next leasing season", logoKey: "company-logo-jsm.png" },
]
