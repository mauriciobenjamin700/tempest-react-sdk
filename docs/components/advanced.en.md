# Overlays & advanced

Components at parity with shadcn/ui, grouped by what they are for. Each page stands on its own: purpose, runnable example, props table and a recap. All imported from `tempest-react-sdk`.

- **[Advanced: essentials](advanced-essentials.md)** — Toggles, label, expandable regions, interaction-triggered overlays and the command palette. The slice almost every screen reaches for.
- **[Advanced: layout & UX](advanced-layout.md)** — Styled scrolling, resizable panes, calendar and scheduler. They shape the space around the content, with no external dependency.
- **[Advanced: navigation & content](advanced-navigation.md)** — Navigation with dropdowns, a menu bar and a carousel. Three ways to take someone elsewhere, or to show more than fits on screen.
- **[Advanced: data](advanced-data.md)** — A stateful table, a step wizard, markdown, a masonry wall, a guided tour, list-to-list transfer, a filter bar and the kanban. Each one solves a whole screen.
- **[Advanced: chat](advanced-chat.md)** — `Chat` for a thread between people and `AIChat` for a conversation with a model. Different components, not variants — which is why they get their own page.

!!! info "Why five pages"
    This was a single 1376-line file. Anyone arriving for `FilterBar` scrolled past 450 lines of something else first. The groups are the ones the original page's recap already named — chat included, which it described as its own category: “`Chat` … and `AIChat` … are different components, not variants.”
