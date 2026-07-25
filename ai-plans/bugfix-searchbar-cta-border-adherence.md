# Bugfix: SearchBar CTA — aderenza ai bordi della input

## Obiettivo

La CTA "selettore campi di ricerca" (il `InputGroupButton` che apre il pannello
`entity.searchIn`) all'interno della search input di `EntityListTable` deve
aderire completamente ai bordi **top**, **right** e **bottom** della input che
la contiene. Attualmente un padding/margin le impedisce di essere flush con i
bordi.

**Vincolo:** il comportamento della input NON deve cambiare. Si modifica solo
lo styling del button.

## Contesto / architettura

Catena di componenti coinvolta:

```
EntityListTable.svelte
  └─ EntityListTableHeader.svelte
       └─ EntityListToolbar.svelte
            └─ SearchBar.svelte   ← QUI è la search input + CTA
```

`SearchBar.svelte` usa i componenti UI `InputGroup` / `InputGroupAddon` /
`HighlightedInput` / `InputGroupButton` da
`$lib/components/ui/input-group`.

Struttura DOM attuale di `SearchBar.svelte` (righe 40-96):

```svelte
<InputGroup class="... rounded-md ...">           <!-- h-8, rounded-lg, flex items-center, NESSUN padding container -->
  <InputGroupAddon align="inline-start" ...>      <!-- Search icon, pl-2 -->
    <Search ... />
  </InputGroupAddon>

  <HighlightedInput ... />                         <!-- input reale, flex-1 self-stretch -->

  {#if search.trim().length > 0}
    <InputGroupButton variant="ghost" size="icon-xs" ...>  <!-- CTA clear X (condizionale) -->
      <X ... />
    </InputGroupButton>
  {/if}

  <InputGroupButton                                <!-- ★ CTA selettore campi (target) -->
    variant="soft"
    size="xs"
    class="mr-1 bg-sky-100/50 hover:bg-sky-200/50 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
    onclick={() => openSheet('entity.searchIn', ...)}
  >
    {searchScopeLabel()}
  </InputGroupButton>
</InputGroup>
```

## Analisi della causa radice

Tre fattori impediscono l'aderenza ai bordi. Tutti risiedono **solo** nel CTA
button, quindi la fix è localizzata e non tocca la input.

### 1. Gap a destra → `mr-1` sulla CTA
`SearchBar.svelte:80` porta `class="mr-1 ..."`. `mr-1` = `margin-right: 0.25rem`
(4px). Il container `InputGroup` **non ha padding** (la sua classe base in
`input-group.svelte:18` è `relative flex w-full min-w-0 items-center` senza
alcun `px-*`/`py-*`), quindi l'ultimo figlio sarebbe già flush col bordo
destro se non ci fosse questo margin.

### 2. Gap top/bottom → `h-6` dal variant `size="xs"`
`InputGroupButton` (`input-group-button.svelte:4-17`) definisce, per
`size: "xs"`:
```
"h-6 gap-1 rounded-[calc(var(--radius)-3px)] px-1.5 ..."
```
`h-6` = 24px. Il container `InputGroup` è `h-8` = 32px con `items-center`, quindi
il bottone da 24px è centrato verticalmente e lascia **4px di gap in alto e 4px
in basso**.

### 3. Angoli arrotondati non allineati (gap visivo residuo ai vertici)
Il bottone ha `rounded-[calc(var(--radius)-3px)]` (≈5px se `--radius`=8px) su
tutti e 4 gli angoli; il container ha `rounded-lg` (8px). Anche dopo aver
riempito l'altezza e rimosso il margin-right, gli angoli arrotondati
creerebbero piccoli gap visivi ai vertici destri. Per aderenza visiva totale:
- angoli **destri** del bottone = stessi del container → `rounded-r-lg`
- angoli **sinistri** = squadrati → `rounded-l-none` (così il lato sinistro del
  bottone è flush contro il campo input)

## Soluzione proposta

Modifica **unica** in `SearchBar.svelte` (righe 77-95), solo sulla classe del
CTA `InputGroupButton`. Nessuna modifica a `InputGroup`, `HighlightedInput`,
`InputGroupAddon`, né al container. La input resta invariata.

### Cambiamenti sulla classe del CTA

| Prima | Dopo | Motivo |
|-------|------|--------|
| `mr-1` | *(rimosso)* | aderisce al bordo destro |
| `h-6` (da `size="xs"`) | `h-full` (override via `cn`/tailwind-merge) | riempie l'altezza 32px → aderisce top/bottom |
| `rounded-[calc(var(--radius)-3px)]` (tutti gli angoli) | `rounded-l-none rounded-r-lg` | angoli destri = container, sinistri squadrati vs input |
| `px-1.5` (interno, da variant) | *invariato* | padding del label, non influisce sull'aderenza |
| `bg-sky-100/50 ... transition-colors` | *invariato* | styling estetico mantenuto |

`cn` (clsx + tailwind-merge) applicato in `input-group-button.svelte:45` ordina
`className` dopo il variant, quindi `h-full` sostituisce `h-6` e
`rounded-l-none rounded-r-lg` sostituiscono `rounded-[calc(var(--radius)-3px)]`
senza conflitti.

### Diff atteso (SearchBar.svelte:77-95)

```diff
   <InputGroupButton
     variant="soft"
     size="xs"
-    class="mr-1 bg-sky-100/50 hover:bg-sky-200/50 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
+    class="h-full rounded-l-none rounded-r-lg bg-sky-100/50 hover:bg-sky-200/50 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
     onclick={() =>
       openSheet(
         'entity.searchIn',
         ...
       )}
   >
     {searchScopeLabel()}
   </InputGroupButton>
```

## File impattati

| File | Modifica |
|------|----------|
| `primebrick-fe-v3/src/lib/components/entity-list-table/toolbar/SearchBar.svelte` | Solo la `class` del CTA `InputGroupButton` (riga ~80) |

**Nessun altro file toccato.** In particolare:
- `input-group.svelte` (container) — invariato
- `input-group-button.svelte` (variant) — invariato
- `highlighted-input.svelte` (input) — invariato
- `input-group-addon.svelte` — invariato

## Criteri di accettazione

1. La CTA tocca il bordo **destro** interno della input (nessun gap).
2. La CTA tocca i bordi **top** e **bottom** interni della input (altezza piena).
3. Gli angoli destri del bottone seguono l'arrotondamento del container
   (`rounded-lg`); i sinistri sono squadrati contro il campo input.
4. Il comportamento della input (focus, digitazione, highlight syntax, scroll
   sync, placeholder) è invariato.
5. La CTA "clear X" condizionale (quando c'è testo) mantiene il suo styling
   attuale — non è oggetto di questa fix.
6. `pnpm run check` passa senza errori.

## Verifica

- `pnpm run check` (typecheck) nella root `primebrick-fe-v3`.
- Ispezione visiva nel dev server (riusando l'eventuale istanza già attiva su
  porta 5173, senza avviare/killare processi — vedi regola dev-server).
