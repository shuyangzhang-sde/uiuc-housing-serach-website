import {
  COMPANIES as companies,
  UNSCRAPABLE_COMPANIES as unscrapable,
  FULLY_LEASED_COMPANIES as leased,
  type Company as SharedCompany,
  type ExcludedCompany as SharedExcludedCompany,
} from "@illirent/core/companies"

export type Company = Omit<SharedCompany, "logoKey"> & { logo: string }
export type ExcludedCompany = Omit<SharedExcludedCompany, "logoKey"> & { logo?: string }

export const COMPANIES: Company[] = companies.map(({ logoKey, ...company }) => ({
  ...company, logo: `/logos/${logoKey}`,
}))
function webCompany({ logoKey, ...company }: SharedExcludedCompany): ExcludedCompany {
  return { ...company, ...(logoKey ? { logo: `/logos/${logoKey}` } : {}) }
}
export const UNSCRAPABLE_COMPANIES = unscrapable.map(webCompany)
export const FULLY_LEASED_COMPANIES = leased.map(webCompany)
export const COMPANY_LOGOS: Record<string, string> = Object.fromEntries(
  COMPANIES.map(({ name, logo }) => [name, logo])
)
