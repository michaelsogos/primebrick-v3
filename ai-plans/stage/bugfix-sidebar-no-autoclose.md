# Plan: Sidebar should not auto-close on navigation

## Objective
The app sidebar in the FE must NOT close automatically when the user clicks any
navigation item. The sidebar must only be closed manually via its own toggle
button (top-right of the sidebar / `SidebarTrigger`).

## Root cause
`primebrick-fe-v3/src/lib/components/AppSidebar.svelte` contains an
`afterNavigate` callback (lines 50–54) that forces the sidebar closed after
every client-side navigation:

```ts
afterNavigate(({ from }) => {
  sidebar.setOpenMobile(false);
  if (from && !sidebar.isMobile) sidebar.setOpen(false);
  shellNav.saveLastRoute(page.url.pathname);
});
```

- `sidebar.setOpenMobile(false)` → closes the mobile drawer on every navigation.
- `if (from && !sidebar.isMobile) sidebar.setOpen(false)` → collapses the
  desktop sidebar on every navigation away from the current route.

These two lines are what cause the unwanted auto-close.

## Proposed change
File: `primebrick-fe-v3/src/lib/components/AppSidebar.svelte`

Remove the two sidebar-closing lines from the `afterNavigate` callback, keeping
only the `shellNav.saveLastRoute` call:

```ts
afterNavigate(({ from }) => {
  shellNav.saveLastRoute(page.url.pathname);
});
```

The `from` parameter becomes unused, so it should be dropped to avoid a
lint/unused warning:

```ts
afterNavigate(() => {
  shellNav.saveLastRoute(page.url.pathname);
});
```

### Notes / side effects
- The `SidebarTrigger` button (top-right of the sidebar / in the topbar) remains
  the only way to close the sidebar, both on desktop and mobile. No change is
  needed there — it already calls `sidebar.toggle()`.
- The keyboard shortcut (`Ctrl/Cmd+B`) still toggles the sidebar via
  `handleShortcutKeydown` in `context.svelte.ts`. Unaffected.
- Clicking outside the mobile sidebar (overlay click) still closes it via the
  `Sidebar.Provider`/`Sheet` behavior. Unaffected.
- The `collapsed`/icon-collapsible logic for parent items that expand the
  sidebar when collapsed (line 117–121) is unaffected — that only expands, it
  does not auto-collapse afterwards.

## Impacted files
- `primebrick-fe-v3/src/lib/components/AppSidebar.svelte` (single edit)

## Acceptance criteria
1. Clicking any nav item navigates to the route but the sidebar stays open
   (desktop, `collapsible="icon"` mode).
2. On mobile, tapping a nav item navigates but the mobile drawer stays open.
3. The sidebar can still be closed manually via the trigger button and
   `Ctrl/Cmd+B`.
4. `pnpm run check` passes with no new errors.
