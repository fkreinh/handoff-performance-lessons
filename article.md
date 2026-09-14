# Small changes, big performance wins

Adding an ID. Resetting a navigation stack. Moving a calculation up one level. Isolating a tiny import.

Some of our biggest performance wins at Handoff came from changes like these. Obvious in hindsight. Harder to spot when each piece of code looks reasonable on its own.

Here are six memorable ones from the last year across our backend and our [universal React Native app](https://www.handoff.ai/tech/shipping-a-universal-expo-app-to-web-ios-and-android-in-production-lessons-from-handoff). Plus a TypeScript DX bonus.

## 1. Count the calculations, not just the queries

A 400-row estimate could cause roughly **800,000 row iterations**. Several GraphQL fields recalculated the whole estimate's breakdown for each row: about 2,000 calculations, each walking 400 rows.

![A compact green stack of estimate rows unrolls into a huge terracotta looping ribbon, showing repeated passes amplifying work.](public/images/01-quadratic-work.png)

On small projects with 30–60 rows, this wasn't obvious. Full-house estimates with 300–400 rows exposed it: repeated calculations hammered the server's JS thread and slowed unrelated requests. That's the danger of quadratic work. Ten times the rows can mean a hundred times the work.

We calculated the estimate once, loaded the supporting data in batches, and reused the results for each row. Totals, rounding, and zero values still had to hold up.

Count calculations as well as database calls. Caching a query doesn't stop you from processing its result thousands of times. Neither does making the function async.

<!-- deep-dive:calculations:start -->
<details>
<summary>Under the hood</summary>

_Simplified parent and row resolvers_

```javascript
async function resolveRows(estimate, rows) {
  const totals = await calculateEstimate(estimate.id);
  return rows.map((row) => ({
    ...row,
    precomputedTotal: totals.get(row.id),
  }));
}

function resolveTotal(row) {
  if (row.precomputedTotal != null) {
    return row.precomputedTotal; // Zero is valid too.
  }
  return calculateRowTotal(row); // Existing fallback.
}
```

The parent computes a result for each row and passes it down. The row resolver then reads that value instead of walking the estimate again. A DataLoader can save a database round trip while leaving all of that CPU work intact, so we had to fix both layers.

Here, `totals` is a map keyed by row ID. That matters too: replacing a repeated calculation with a repeated search through the entire result array can leave another quadratic loop behind. Build the lookup once, then read from it.

The null check is deliberate. A zero total must take the fast path, not fall through because it is falsy. We kept the fallback because rows also arrive through other queries and mutations. The precomputed values travel with this response; they are not a long-lived cache of totals that could go stale after an edit.

</details>
<!-- deep-dive:calculations:end -->

## 2. One missing ID, a waterfall of requests

We already had the data. But some GraphQL responses were missing an entity's `id`, so Apollo couldn't reliably connect them to what it had cached.

![Tactile 3D cache block with a missing identity tile beside a cascade of repeated terracotta blocks; an ID tile locks into a calm green reusable block.](public/images/02-cache-waterfall.png)

Auth, navigation, permissions, and billing would fetch again. One missing ID caused a cascade of work that shouldn't have happened.

We added IDs to queries and manual cache writes, alongside query and fetch-policy fixes. Fewer unnecessary requests, less repeated work, and less pressure on the server.

Check the lint rules for your tools. GraphQL ESLint's [require-selections](https://the-guild.dev/graphql/eslint/rules/require-selections) catches missing `id` selections when the type has one. We enabled it. A simple lint error would have saved a lot of this headache.

<!-- deep-dive:cache:start -->
<details>
<summary>Under the hood</summary>

_One of the fragment fixes; unrelated fields omitted_

```diff
 fragment EstimateFragment on Estimate {
+  id
   name
 }
```

_The same fix in a manual cache write_

```diff
 data: {
+  id: messageId,
   message,
   role,
 },
```

Apollo normally identifies an entity using its `__typename` and ID. A name alone is just a value inside a particular response; it does not give the cache a reliable identity to share across queries. Nested entities need their own identity too. Selecting the estimate ID does not identify its contact or organization.

Manual writes need the same care. We added the message ID to the data being written, so it matched what the fragment expected. When investigating this, check the query selection, the actual response, and any code that writes the same entity locally.

Then make the mistake harder to repeat. We enabled the GraphQL operations lint rules with access to our schema and a processor for queries embedded in TypeScript. Custom cache identity fields need matching lint rules. And an ID does not make an incomplete query complete: missing fields and fetch policies still need their own fixes.

</details>
<!-- deep-dive:cache:end -->

## 3. Native stacking didn't translate well to web

During longer web sessions, everything started to crawl. On mobile, stacking screens works naturally: you open a screen, then go back, popping it off the stack.

![Sculptural stack of retained screens and observer beads resolves into one clean root slab.](public/images/03-reset-the-stack.png)

Our web app used the same React Navigation stack, but people moved between pages through the sidebar. Those links used `router.push()`. Even going home added a page instead of clearing the old stack. Screens and their observers kept accumulating. [Freezing](https://reactnavigation.org/docs/stack-navigator/#freezeonblur) reduced rendering, but didn't release those subscriptions.

We had to clear the stack explicitly when a main root page became visible. Removing those trees released their observers. One local comparison dropped from **3,671 query observers to 298**, with the same **105 cache objects**.

The native pattern was useful, but our web navigation needed different cleanup.

<!-- deep-dive:navigation:start -->
<details>
<summary>Under the hood</summary>

_Tab reset with retained params; focus guards and state validation omitted_

```typescript
// Once the target root is visible, read its active tab.
const root = state.routes[state.index];
const tabState = root.state;
const activeTab = tabState?.routes[tabState.index];

navigation.dispatch(CommonActions.reset({
  index: 0,
  routes: [{
    name: "(tabs)",
    state: {
      index: 0,
      routes: [{
        name: selectedTab,
        params: activeTab?.params,
      }],
    },
  }],
}));
```

_The tab bar also passes the destination’s retained params_

```diff
-navigation.navigate(route.name);
+navigation.navigate(route.name, route.params);
```

The first reset removed the retained screens, but rebuilding a route from its name alone also discarded its parameters. A follow-up carried the active tab’s params into the replacement route. That kept the selected date, view, and filters while still releasing the old detail trees. For a root outside the tab navigator, we preserved the root route’s own params instead.

There were two places to fix. Cleanup had to preserve the destination state, and the navigation controls had to pass it back when revisiting a tab. Otherwise a sidebar or tab press could erase the params before cleanup even ran. On web, we reused only strings and arrays of strings from retained params, rather than copying nested navigation objects into the URL.

The reset still runs only when the intended root is actually visible. We also avoid repeated resets and cancel scheduled cleanup if focus changes. Detail-to-detail navigation keeps its normal stack. The goal is to release the expensive screen trees while keeping the small amount of state that makes returning to a page feel right.

</details>
<!-- deep-dive:navigation:end -->

## 4. Render less, less often

A lot of React performance comes down to this: render less, less often. Only do the work the current interaction needs.

![Tactile green chambers contrast a closed chamber wasting energy on repeated internal work with a calm chamber preserving an identical arrangement.](public/images/04-render-less.png)

Our closed dialogs and bottom sheets kept their forms mounted, which preserved state. Even with [React Compiler](https://react.dev/learn/react-compiler), those trees can still rerender when state or context changes, while nobody is using them. We used [react-freeze](https://github.com/software-mansion/react-freeze) to pause rendering without unmounting them: keep the state, resume before opening.

The UI already worked. This made it cheaper to keep around. That's often the game with React performance: give it less to do.

<!-- deep-dive:sheets:start -->
<details>
<summary>Under the hood</summary>

_Simplified from the row-panel change; other props omitted_

```diff
+<Freeze freeze={!panelOpen}>
   <RowPanelProvider>
     <BottomSheet onDismiss={handleDismiss}>
       <RowForm />
     </BottomSheet>
   </RowPanelProvider>
+</Freeze>
```

_Resume before presenting; freeze after dismissal_

```typescript
function openPanel() {
  setPanelOpen(true);
  requestAnimationFrame(() => sheetRef.current?.present());
}

function handleDismiss() {
  setPanelOpen(false);
}
```

The boundary has to include the work you want to stop. Freezing the form alone still leaves its provider free to rerender, derive values, and notify consumers. We moved the boundary above both. The state that controls freezing stayed outside it, so opening the panel could wake the tree back up.

The ordering matters. We set the panel active before presenting it, then froze it from the dismissal callback. Freezing as soon as someone taps Close can catch the sheet halfway through its transition. The animation frame here is the scheduling used by our sheet integration; match this to the lifecycle of the component you use.

This preserves mounted React state, but it does not unsubscribe queries or stop timers. Check which work actually disappeared in the profiler. If the cost comes from a subscription that keeps running while hidden, a render boundary alone will not solve it.

</details>
<!-- deep-dive:sheets:end -->

## 5. A small PostHog queue, a lot of JS work

PostHog's React Native storage was keeping **200 events, about 1.86 MB**. Small enough. But adding one event could turn the whole cache into JSON again and write it to storage.

![A tiny bead joins a green queue slab, producing a broad fan of terracotta slabs containing identical rows of beads.](public/images/05-small-queue-many-copies.png)

One new event, another copy of everything. During bursts, those copies piled up faster than writes finished. Profiling found **284 large strings accounting for roughly 1.06 GB**.

We removed duplicate feature-flag events, cut the queue to 30, and kept only the latest copy waiting to be written. That didn't eliminate every JSON conversion, but it reduced the data being processed and the copies kept alive. The smaller queue also means losing older analytics events sooner when offline.

Follow what happens after an append. A small queue can still create a lot of work if every change rewrites the whole thing.

<!-- deep-dive:persistence:start -->
<details>
<summary>Under the hood</summary>

_Queue and storage configuration_

```diff
-maxQueueSize: 200,
+maxQueueSize: 30,
+customStorage: createPostHogStorage(),
```

_setItem and drainWrites excerpts; reads and retries omitted_

```typescript
// Every new snapshot replaces the pending one for this key.
pendingValues.set(key, value);
const inFlightWrite = inFlightWrites.get(key);
if (inFlightWrite != null) return inFlightWrite;
const write = drainWrites(key).finally(() => inFlightWrites.delete(key));
inFlightWrites.set(key, write);
return write;

// One writer drains the latest pending value for each file.
async function drainWrites(key: string) {
  while (pendingValues.has(key)) {
    const value = pendingValues.get(key);
    pendingValues.delete(key);
    if (value == null) continue;
    await new File(Paths.document, key).write(value);
  }
}
```

If A is being written while B and C arrive, write A, then C. Each value is a complete snapshot of the queue, so C replaces B without losing the events it still contains. This would be wrong for a stream of independent events: the optimization depends on newer snapshots superseding older ones.

We track one active writer per storage key. New calls replace the pending value and join that write instead of launching another one. The writer drains the latest value, and `finally` releases its slot. The full adapter also handled failures, including a newer value arriving while the active write failed; those paths are omitted here.

Changing the queue limit was not enough for existing installs. We also trimmed oversized persisted queues when loading them. And this adapter received strings that PostHog had already serialized, so it could bound retained copies without avoiding every JSON conversion. Removing duplicate events reduced the work before it reached storage.

</details>
<!-- deep-dive:persistence:end -->

## 6. The dark side of DOM components

A single import can bring a whole chain of app code into a DOM bundle. Our editor needed a tiny underline helper. Importing it from a shared module pulled in GraphQL, telemetry, and their dependencies too.

![Tactile ceramic underline hooks contrast a dense dependency mass with a single self-contained green form.](public/images/06-follow-the-import.png)

Don't assume the bundler will strip everything you aren't using. [Expo Atlas](https://docs.expo.dev/guides/analyzing-bundles/) showed what actually got included. We isolated the helper and removed unnecessary `use dom` directives. Together, those changes reduced reported DOM bundle output from **27.6 MB to 1.7 MB**.

Keep these imports small and self-contained. Sometimes duplicating a few lines is better than dragging a much larger bundle along with them.

<!-- deep-dive:bundles:start -->
<details>
<summary>Under the hood</summary>

_The underline helper, kept inside the DOM entry_

```diff
-import { UNDERLINE } from "@/design-system/RichTextEditor/transformers";
+import type { TextFormatTransformer } from "@lexical/markdown";
+
+const UNDERLINE: TextFormatTransformer = {
+  format: ["underline"],
+  tag: "_",
+  type: "text-format",
+};
```

The useful thing to inspect is the path from the DOM entry to the unwanted dependency. Our underline transformer came from a shared module that also reached GraphQL and telemetry. The editor did not need those features, but its import graph still reached them. Keeping this tiny value local cut that path. The `import type` disappears from the JavaScript output.

We also checked where `use dom` was declared. It belongs at an intentional DOM boundary, not automatically on every module used by that component. We removed unnecessary directives from helpers and wrappers while keeping the real DOM entry intact.

Rebuild and inspect the output after each change. A smaller-looking source file says little about what ships. Our reported reduction includes both the isolated import and the removed boundaries; it is not a benchmark of this helper alone. For a larger shared helper, a small dependency-free module would be easier to maintain than copying it.

</details>
<!-- deep-dive:bundles:end -->

## Bonus: 53 million fewer type instantiations

We had already moved to Go-based TypeScript, and a cold check still took **79 seconds**. Microsoft's [TypeScript 7 benchmarks](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) had VS Code building in about 10 seconds. If VS Code could do that, why was our Node server taking over a minute just to check types? That was worth digging into.

![Two identical green marbles travel a sprawling coiled track and a short direct track, arriving at identical output molds.](public/images/07-less-type-work.png)

_Our before-and-after: cold checks on the same setup, single-threaded TypeScript 7.0.2. Microsoft's VS Code benchmark used four checker workers on a different setup._

Our Prisma types described configurations we didn't use. Narrowing them in just a few files brought that same check down to **13 seconds**, with **53 million fewer type instantiations** and identical JavaScript. With a warm cache, small edits can type-check in about **2 seconds**.

That's a big win for AI coding too. Less waiting between editing and checking means a much better feedback loop. Check `--extendedDiagnostics` before accepting slow checks as normal. Even a faster compiler benefits from less work.

<!-- deep-dive:dx:start -->
<details>
<summary>Under the hood</summary>

_The constructor change; existing runtime options omitted_

```diff
+type AppPrismaClientOptions = Prisma.PrismaClientOptions & {
+  log: Array<Prisma.LogLevel | Prisma.LogDefinition>;
+  omit?: never;
+};
+
-const client = new PrismaClient(options);
+const client = new PrismaClient<
+  AppPrismaClientOptions, "query", undefined
+>(options);
```

The expensive part was not the number of lines in the constructor. Prisma’s inferred type described global field-omission configurations we never used. When the client crossed transaction and extension boundaries, TypeScript had to expand and compare those model types.

The third constructor type argument, `undefined`, makes “no global omissions” explicit. `omit?: never` stops the options from contradicting that contract. Neither changes the runtime data. We applied the same contract to all five constructors and extension inputs, then narrowed a helper to the one model it used. The measured gain came from the combined change.

Check your generated Prisma definitions before copying the generic positions: the constructor and exported type alias use different ones. We added a compile-time check to catch the omission type widening again and compared emitted JavaScript. When measuring, keep the compiler and cold-cache settings fixed and inspect `--extendedDiagnostics`; otherwise a warm run can look like a type optimization.

</details>
<!-- deep-dive:dx:end -->

## The small wins add up

These are some of the most memorable ones. But performance is often death by a hundred paper cuts: a missing database index, another observer, another hidden render, another copy of the same data. Each looks harmless until they add up.

We chip away at it whenever we can. There are hundreds of smaller fixes across the team: one less render, a tighter query, less work on the JS thread. That steady work shapes how the product feels every day.

Not all fast software is good, but [all good software is fast](https://x.com/tobi/status/1787139157078188180). Contractors should be able to get their work done without waiting on ours.

That's the standard we strive for at Handoff.
