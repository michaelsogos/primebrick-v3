# ServiceUnavailableView — align CTAs to ErrorPage 500 anatomy, drop OFFLINE status line

## Status: ✅ DONE — Plan date: 2026-11-19 / 09:58 UTC · verified 2026-12-22

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `ServiceUnavailableView.svelte`: remove `status` prop + `{#if status}` OFFLINE line; replace single outline Button with ErrorPage-style `<nav>` — left CTA becomes refresh (`RefreshCw` + `app.common.refresh` → `onRetry`, keep `{#if onRetry}` gate), right CTA = `resolveSafePage`-backed return-home (`House` + `app.error.return_home`, primary gradient, disabled state when `homeHref === null`) | ✅ done | 2026-12-22 | fe `0adb875` — verbatim ErrorPage anatomy (gap-20 font-mono nav, h-3.5 icons, primary-gradient home) |
| 2 | `EntityFormPage.svelte` (sole caller, line 533): drop `status={svc.status}` prop | ✅ done | 2026-12-22 | fe `0adb875` |
| 3 | Typecheck (`pnpm check`) + rendered verification of the unavailable surface | ✅ done | 2026-12-22 | svelte-check 0/0; NEW persistent spec `__tests__/service-unavailable.test.ts` 5/5 — nav anatomy, no OFFLINE, retry fires onRetry, home anchor resolves, aria-disabled span while unresolved; check-standards clean |

---

## TIC findings (empirical — verified in source)

### The hero the user means

`src/lib/components/ServiceUnavailableView.svelte` — rendered by `EntityFormPage` when `useServiceAvailability` reports the owning microservice has no online instance:

```svelte
<DynamicIcon name="server-off" size={32} />        <!-- huge backend-off icon -->
<h2>{$t('app.service.unavailable', { service })}</h2>
<p>{$t('app.service.unavailable_detail')}</p>
{#if status}<span class="uppercase">{status}</span>{/if}   <!-- ← "OFFLINE" to remove -->
<Button variant="outline" size="sm" onclick={onRetry}>{$t('app.common.refresh')}</Button>
```

- `status` is the registry aggregate (`'offline'`, `'degraded'`, …) — rendered uppercase as the redundant OFFLINE line under the phrase.
- Sole caller: `src/lib/entity-form/EntityFormPage.svelte:533` (`service`, `status={svc.status}`, `onRetry={() => void attemptLoad()}`).
- Entity **list** pages do NOT use this view — `useEntityList` surfaces unavailability as an error string inside the table (`useEntityList.svelte.ts:662`). No other call sites.

### Target anatomy — `ErrorPage.svelte` (the 500 surface)

```svelte
<nav class="mt-6 flex items-center gap-20 font-mono text-xs font-normal">
  <button data-testid="error-page-back-cta" onclick={goBack}
          class="inline-flex cursor-pointer items-center gap-1.5 hover:underline">
    <ArrowLeft class="h-3.5 w-3.5" /> {$t('app.error.go_back')}
  </button>
  {#if homeHref}
    <a data-testid="error-page-home-cta" href={resolve(homeHref as '/')}
       class="inline-flex items-center gap-1.5 hover:underline decoration-primary">
      <House class="h-3.5 w-3.5 text-primary" />
      <span class="text-primary-gradient">{$t('app.error.return_home')}</span>
    </a>
  {:else}
    <span data-testid="error-page-home-cta" class="…text-foreground/40" aria-disabled="true">
      <House class="h-3.5 w-3.5" /> {$t('app.error.return_home')}
    </span>
  {/if}
</nav>
```

`homeHref` comes from `resolveSafePage(page.url.pathname)` in `onMount` (`$lib/navigation/safe-page.ts` — never throws, falls back to `/`).

### Requested mapping (user decision — verbatim)

- Remove the OFFLINE status line (and the now-dead `status` prop).
- Two CTAs styled exactly like the 500 page's — same mono/xs nav, same icon+text link anatomy.
- The left slot (go-back on 500) becomes **refresh** here: `RefreshCw` icon + `app.common.refresh` label → calls `onRetry`.
- The right slot stays return-home verbatim (primary gradient House CTA).

### Design details

- Keep: `server-off` DynamicIcon (32px), `app.service.unavailable` title, `app.service.unavailable_detail` body — untouched.
- Testids per `e2e-testid-convention.md` (`<component-scope>-<element-purpose>`): root `service-unavailable` stays; new CTAs `service-unavailable-retry` / `service-unavailable-home`.
- No new i18n keys — `app.common.refresh` + `app.error.return_home` already exist in all locales (BE-owned; fallback confirms).
- Retry CTA keeps the `{#if onRetry}` conditional (prop stays optional).
- `useServiceAvailability.status` keeps existing for other consumers — only the view stops reading it.

## Acceptance criteria

- Unavailable surface renders: icon → title → detail → nav (refresh | return-home), no OFFLINE line.
- Refresh CTA invokes `onRetry` (re-attempts load); home CTA navigates to `resolveSafePage` result, disabled when unresolved.
- `pnpm check` clean; no `status` prop remaining on the component or call site.
