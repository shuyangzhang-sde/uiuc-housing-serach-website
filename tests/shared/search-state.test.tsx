import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { act, create } from "react-test-renderer"
import { FiltersProvider, useFilters } from "@illirent/search-state"
import { DEFAULT_FILTERS } from "@illirent/core"

test("Browse and Map share applied filters across a view change", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let state: ReturnType<typeof useFilters>
  function Screen({ view }: { view: string }) {
    state = useFilters()
    return createElement("span", null, `${view}:${state.filters.max_price_per_bed}`)
  }
  const app = (view: string) => createElement(FiltersProvider, null, createElement(Screen, { view }))
  let renderer: ReturnType<typeof create>
  await act(async () => { renderer = create(app("Browse")) })
  await act(async () => { state.setFilters({ ...DEFAULT_FILTERS, max_price_per_bed: 900 }) })
  await act(async () => { renderer.update(app("Map")) })
  assert.equal(state!.filters.max_price_per_bed, 900)
  assert.deepEqual(renderer!.toJSON(), { type: "span", props: {}, children: ["Map:900"] })
  await act(async () => { renderer.unmount() })
})
