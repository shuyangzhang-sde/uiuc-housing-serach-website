import { SORT_OPTIONS, type ListingSort } from "@illirent/core"
import { Dropdown, DropdownChoice, type DropdownAnchor } from "./Dropdown"

export function SortDropdown({ anchor, value, onChange, onClose }: { anchor: DropdownAnchor; value: ListingSort; onChange: (value: ListingSort) => void; onClose: () => void }) {
  return <Dropdown anchor={anchor} title="Sort by" width={290} onClose={onClose}>{SORT_OPTIONS.map(option => <DropdownChoice key={option.key} group="Sort" label={option.label} selected={value === option.key} onPress={() => { onChange(option.key); onClose() }} />)}</Dropdown>
}
