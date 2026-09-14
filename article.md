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
<summary>Show me the change — Calculate once. Let each row reuse the result.</summary>

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

The important move was carrying the computed values down to the row resolvers. Loading the same rows from a cache was still expensive if every field then recalculated the estimate. Here, the helper names are simplified; `totals` represents the results indexed by row ID.

Use a null check, not a truthiness check. Zero is a valid result. We kept the fallback for rows arriving through other paths and batched the supporting reads in the parent too. Moving the work only helps if the children actually stop doing it.

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
<summary>Show me the change — Include the identity, even when the UI never displays it.</summary>

_One of the fragment fixes; unrelated fields omitted_

```diff
 fragment EstimateFragment on Estimate {
+  id
   name
 }
```

The UI only needed the name. The cache needed the ID. The same applies to nested entities: an ID on the parent does not identify every object below it.

_The same fix in a manual cache write_

```diff
 data: {
+  id: messageId,
   message,
   role,
 },
```

We checked manual writes as well as server responses. Then we enabled the GraphQL operations lint rules so missing `id` selections would fail before review. The rule needs your schema, and embedded queries need the GraphQL processor. If your cache uses custom identity fields, require those instead.

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
<summary>Show me the change — Clear retained detail screens at a deliberate root boundary.</summary>

_Reset action from the root-focus hook; guards shown in simplified form_

```typescript
// Run on root focus, using the main stack's navigation object.
if (pathname !== rootHref) return;
if (navigation.getState().routes.length <= 1) return;

navigation.dispatch(
  CommonActions.reset({
    index: 0,
    routes: [{
      name: "(tabs)",
      state: {
        index: 0,
        routes: [{ name: selectedTab }],
      },
    }],
  }),
);
```

Reaching a root page was our cleanup boundary. We reset the main stack to the selected tab, which removed the old detail trees. Freezing a retained screen could reduce its rendering; removing it released its observers.

The real hook also checked that a reset was needed, guarded against re-entry, and canceled scheduled cleanup when focus changed. Keep that boundary explicit: normal detail-to-detail navigation should still stack. The route names here belong to our navigator.

</details>
<!-- deep-dive:navigation:end -->

## 4. Render less, less often

A lot of React performance comes down to this: render less, less often. Only do the work the current interaction needs.

![Tactile green chambers contrast a closed chamber wasting energy on repeated internal work with a calm chamber preserving an identical arrangement.](public/images/04-render-less.png)

Our closed dialogs and bottom sheets kept their forms mounted, which preserved state. Even with [React Compiler](https://react.dev/learn/react-compiler), those trees can still rerender when state or context changes, while nobody is using them. We used [react-freeze](https://github.com/software-mansion/react-freeze) to pause rendering without unmounting them: keep the state, resume before opening.

The UI already worked. This made it cheaper to keep around. That's often the game with React performance: give it less to do.

<!-- deep-dive:sheets:start -->
<details>
<summary>Show me the change — Put the expensive provider inside the freeze boundary too.</summary>

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

Freezing just the form leaves its provider outside the boundary, still doing work. We wrapped both. The open-state control stayed outside so it could wake the tree back up.

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

Use the sheet’s dismissal callback, not the start of its closing animation. That keeps the transition live and the mounted form state intact. The target is unnecessary rendering; freezing is not a general pause button for background work.

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
<summary>Show me the change — Keep the current write and the latest waiting snapshot.</summary>

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

If A is being written while B and C arrive, write A, then C. These are complete snapshots of the queue, so C replaces B without dropping the events it still contains. Different storage keys have independent writers.

Our adapter also released the in-flight entry after completion, handled failed writes, and trimmed existing oversized queues on load. It received strings that PostHog had already serialized. Bounding those pending copies helped; reducing duplicate events and queue size reduced the work feeding them.

</details>
<!-- deep-dive:persistence:end -->

## 6. The dark side of DOM components

A single import can bring a whole chain of app code into a DOM bundle. Our editor needed a tiny underline helper. Importing it from a shared module pulled in GraphQL, telemetry, and their dependencies too.

![Tactile ceramic underline hooks contrast a dense dependency mass with a single self-contained green form.](public/images/06-follow-the-import.png)

Don't assume the bundler will strip everything you aren't using. [Expo Atlas](https://docs.expo.dev/guides/analyzing-bundles/) showed what actually got included. We isolated the helper and removed unnecessary `use dom` directives. Together, those changes reduced reported DOM bundle output from **27.6 MB to 1.7 MB**.

Keep these imports small and self-contained. Sometimes duplicating a few lines is better than dragging a much larger bundle along with them.

<!-- deep-dive:bundles:start -->
<details>
<summary>Show me the change — Replace a heavy import with the tiny helper the editor needs.</summary>

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

The helper was small. Its import path was not. That shared module reached into app code the DOM editor did not need. Keeping these few lines local removed that path; the type-only import added no runtime dependency.

We also removed `use dom` from modules that were not meant to create their own DOM boundaries. The actual DOM entry kept it. Rebuild and inspect the output in Expo Atlas: the reduction came from both changes, not this one helper alone.

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
<summary>Show me the change — Tell Prisma which configurations the app actually uses.</summary>

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

We never configured global field omissions. The third type argument, `undefined`, makes that explicit; `omit?: never` prevents the options from contradicting it. These are type changes. The runtime configuration stays the same.

We applied this to all five constructors, aligned extension inputs, and narrowed a helper to the model it actually used. The measured gain came from that combined change. Check your generated Prisma definitions before copying the generic positions: the constructor and the exported type alias use different ones.

</details>
<!-- deep-dive:dx:end -->

## The small wins add up

These are some of the most memorable ones. But performance is often death by a hundred paper cuts: a missing database index, another observer, another hidden render, another copy of the same data. Each looks harmless until they add up.

We chip away at it whenever we can. There are hundreds of smaller fixes across the team: one less render, a tighter query, less work on the JS thread. That steady work shapes how the product feels every day.

Not all fast software is good, but [all good software is fast](https://x.com/tobi/status/1787139157078188180). Contractors should be able to get their work done without waiting on ours.

That's the standard we strive for at Handoff.
