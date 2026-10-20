# Shared dialog strategy — research for #36

**Verdict: use native `<dialog>` opened with `showModal()`, behind one small
controlled `ModalDialog` component with explicit initial-focus and focus-return
policy. Do not build a custom focus trap or an inert-background manager.**

This recommendation holds for the current Windows/NSIS desktop target. The
locked jsdom release lacks `showModal()` and `close()`: use a narrow test fixture,
not a production fallback. There is a separate **older-macOS support caveat**
below; do not generalize the Windows conclusion to every WebKit runtime.

- Research ticket / decision owner: [#36](https://github.com/2233admin/skillgate-team/issues/36), the Wayfinder map maintainer.
- Implementation consumers: the delete-dialog and agent-launch-dialog fix owners.
- Source baseline: `origin/master` at `e6ae108996eac7844c3d5f9b2026212d65ba7d85`.
- Publication: throwaway branch `research/dialog-strategy`; this note is not a
  product change and the branch must not be merged. Publishing it does not close
  #36 or authorize the blocked fix tickets to start.
- Reading goal: give both fix owners one implementation contract and distinguish
  unit-test evidence from the real-WebView acceptance still required.

## What the code already does, and the exact gap

Paths and line numbers below are relative to the repository root at the baseline.

| Existing owner | Observed behavior | Missing mechanism |
| --- | --- | --- |
| `desktop-tauri/src/files/file-detail.tsx:30,89-98,127,142-154` | Local `confirmDelete` state conditionally mounts a backdrop and `div[role=dialog]`; Cancel clears state; successful delete closes and refreshes the catalog. | No initial focus, native modality, Escape handler, or explicit focus return. |
| `desktop-tauri/src/app.css:102` | Delete has a fixed, centered `.modal-backdrop` and styled `.delete-modal`. | Styling is not a keyboard trap or background inertness. It is reusable visual styling, not a modal abstraction. |
| `desktop-tauri/src/agent/agent-launch-dialog.tsx:13-21,54-83,129-181` | Controlled `open`, conditional render, ordinary dialog-role div around a launch form. Harness policy loads asynchronously; Cancel calls `onCancel`; success calls `onStarted` at line 126. | No modal positioning, focus entry/return, Escape, or background blocking. |
| `desktop-tauri/src/catalog/catalog-page.tsx:213-234` | Start-agent trigger is in the detail pane; the launch dialog mounts after `TerminalWorkspace`; both close callbacks clear `launchAgent`. | Its DOM position explains why normal-flow rendering can appear after the workspace, rather than above it. |
| `desktop-tauri/src/main.tsx:1-9` | Renderer runs under React `StrictMode`. | Any effect-based dialog lifecycle must survive setup/cleanup/setup without losing modality or returning focus during a reopened cycle. |

A literal sweep of `desktop-tauri/src` found no `showModal`, `HTMLDialogElement`,
or `useModal` helper. The two dialog-role divs are the relevant existing dialog
implementations. Reuse their state, callbacks, content, form logic, and CSS
appearance; add only the shared native lifecycle owner. No modal dependency is
installed in `desktop-tauri/package.json:15-29`.

The audit's agent-dialog top position of **959.9px at 1180×760** is reported audit
evidence, not a measurement repeated by this research. The configured window is
indeed 1180×760 (`desktop-tauri/src-tauri/tauri.conf.json:18-21`).

## Compare the candidates against these callers

| Requirement | Native `<dialog>` + shared lifecycle/focus helper | Custom `useModal` over divs |
| --- | --- | --- |
| Initial focus | Native dialog focusing steps, with a deliberate target selected by the helper. | Implement target selection and timing from scratch. |
| Modal keyboard/background behavior | `showModal()` makes outside content inert; browser owns modal focus containment and top-layer membership. | Implement Tab/Shift+Tab cycling, dynamic/disabled-control handling, background inertness, and cleanup correctly. ARIA alone does not provide these. |
| Escape | Handle the dialog's native `cancel` event and synchronize React state. | Own keydown registration, teardown, and topmost-dialog policy. |
| Focus return | Native `close()` already attempts restoration; small explicit policy covers conditional unmount, removed triggers, and programmatic `.click()` tests. | Own the entire restore policy, including unmount and missing-trigger fallback. |
| Positioning | Top layer avoids the agent's normal-flow location; native modal rendering is fixed and centered by default. Keep sizing/scroll/backdrop CSS explicit. | Must add shared fixed overlay/centering and consider stacking/ancestor clipping independently. |
| Current Vitest harness | Add two missing methods in a test-only fixture. Browser behavior still needs browser acceptance. | Fewer missing DOM methods, but jsdom still cannot validate layout, real keyboard containment, or effective inertness. |
| Cost / risk | One narrow React/native synchronization component, no dependency. | More production behavior and edge cases to own, without a demonstrated platform need on Windows. |

The [HTML dialog specification][html-dialog] defines modal opening, top-layer
membership, background blocking, initial focus, native cancellation, and closing
focus restoration. Its [rendering section][html-rendering] supplies modal fixed
positioning and `::backdrop`. The [WAI-ARIA modal-dialog pattern][apg] requires
contained focus, Escape, appropriate initial focus, and return to the invoking
control or a logical replacement. A `role="dialog" aria-modal="true"` div does
not implement those behaviors.

**Decision:** native wins on production ownership, not on jsdom convenience.
Leave custom `useModal` unimplemented. Reconsider it only if the supported
runtime contract demonstrably includes a WebView without native modal support
and the platform owner decides that runtime must remain supported.

## Platform support: Windows is clear; older WebKit is not

[Tauri v2's own WebView documentation][tauri-webviews] states that Windows uses
**WebView2, based on Microsoft Edge and therefore Chromium**, and that the
runtime updates itself; Tauri's installer ensures WebView2 is installed when
needed. The HTML specification's compatibility table lists `showModal()` from
**Chrome 37 / Edge 79**, far older than current Windows WebView2. Tauri 2 is
confirmed by `desktop-tauri/src-tauri/Cargo.toml:22`, and the active bundle target
is `nsis` (`tauri.conf.json:31-34`). Native dialog is not a practical platform
blocker for this Windows target. This is source-based support evidence, not a
claim that a particular installed WebView2 build was exercised here.

Do not treat `vite.config.ts:26` (`chrome105` on Windows, `safari13` otherwise)
as a runtime feature guarantee: a JavaScript build target does not polyfill DOM
APIs. The same Tauri configuration retains `macOS.minimumSystemVersion: "10.15"`
at lines 44-45, while the dialog compatibility table starts Safari support at
**15.4**. Tauri uses system WebKit on macOS/Linux. The configured minimum alone
therefore does not establish native-dialog support on every permitted macOS
installation. Before shipping a macOS build, the platform owner must establish a
supported OS/WebKit floor with dialog support, or explicitly reopen this
mechanism decision. This research does not raise that floor, add a polyfill, or
silently implement a second modal path. Linux runtime support is likewise not
certified here.

## Shared API contract for both fix tickets

Create **one** owner at `desktop-tauri/src/components/modal-dialog.tsx`. This
new file is warranted because neither feature-specific component can own shared
lifecycle behavior without making the other feature depend on it. Export only
the shared component; there is no separate custom modal registry or public
focus-trap hook.

```tsx
import type { ReactNode, RefObject } from "react"

export interface ModalDialogProps {
  open: boolean
  labelledBy: string
  initialFocusRef: RefObject<HTMLElement | null>
  restoreFocusTo: () => HTMLElement | null
  onRequestClose: () => void
  className?: string
  children: ReactNode
}

export function ModalDialog(props: ModalDialogProps): ReactNode
```

`restoreFocusTo` is deliberately a resolver, not a second stored element: callers
can select a connected trigger or a stable workspace fallback **at close time**.
Do not add close reasons, stacking options, backdrop-dismiss options, or a
configuration registry for these two callers.

### Lifecycle and focus rules

1. Render a real `<dialog aria-labelledby={labelledBy}>` containing `children`.
   Keep the existing visible title IDs. Native semantics supply the dialog role
   and modal accessibility state; do not add a second dialog-role wrapper.
   Do not set an `open` JSX attribute: that opens a non-modal dialog and conflicts
   with `showModal()`. The component may remain mounted while closed; callers
   that conditionally mount it are also supported.
2. A layout effect owns the imperative lifecycle. For a connected dialog changing
   to open, capture `document.activeElement` **before** `showModal()`, call it
   only when `dialog.open` is false, then focus the connected initial target
   inside it with `{ preventScroll: true }`. If that target is absent, leave the
   browser's chosen in-dialog focus alone. Focus once per opening, not whenever
   policy data or callback identity changes. Keep latest callbacks in refs so a
   parent's render does not close and reopen the dialog.
3. On `cancel` (native Escape), call `event.preventDefault()` and invoke
   `onRequestClose()` once. The caller clears its existing state; the effect
   then calls `dialog.close()`. Cancel buttons use the same request-close path.
   No document-level Escape listener, hand-written Tab loop, or background
   `inert` mutations. Backdrop clicks do **not** dismiss either dialog.
4. For `open=false` or unmount, close the captured dialog node if still open.
   Do not just remove its `open` attribute or rely on removal from the DOM as
   the sole close mechanism. A `close` event produced by this controlled close
   is not another request to close. Do not wire both `cancel` and `close` to
   `onRequestClose`, and do not use `form method="dialog"` to bypass state.
5. Let native `close()` restore focus first. After the closing React commit,
   resolve `restoreFocusTo()`; if usable, focus it only when it is not already
   active. If the resolver returns no connected, enabled focus target, try the
   captured pre-open element under the same checks. A caller must supply a
   stable, focusable workspace fallback when its trigger can disappear; never
   deliberately focus `body` or a detached/disabled node. Use `preventScroll`.
   Do not override a deliberate post-close workflow focus change to another
   connected control (for example, the launched terminal).
6. Restoration is **once per completed open cycle**. A deferred restoration
   checks the opening generation and is canceled if the dialog has reopened;
   StrictMode's cleanup/setup replay must not steal focus from the reopened
   dialog. Close/unmount must not call launch, delete, or `onRequestClose` again.
   Any deferred work must tolerate a disconnected dialog and owner teardown.

The explicit resolver supplements rather than replaces native focus restoration.
This is a lifecycle contract for future implementation, not tested product code
in this branch. The shared-component tests must cover its subtle unmount and
StrictMode cases rather than letting each feature invent its own variation.

### Delete-dialog adoption

- Keep `confirmDelete`, the exact granted-path text, and the existing delete /
  recovery / revision behavior. Replace the backdrop and inner dialog div at
  `file-detail.tsx:142-154` with `ModalDialog`.
- `open={confirmDelete}`, `labelledBy="delete-title"`, initial target = **Cancel**
  button ref (the least destructive action); Cancel and Escape both clear
  `confirmDelete`. Neither invokes `files.delete`.
- `restoreFocusTo` selects the connected Delete trigger ref. If refresh removes
  the file/detail and therefore that trigger, select a stable CatalogPage
  workspace heading with `tabIndex={-1}` supplied by the parent. Pass that
  fallback resolver through FileDetail's props; do not query an arbitrary first
  button. Cancellation while the file remains selected must return to Delete.
- Preserve success closing and Undo; a failed delete stays open. The existing
  error lives outside the modal (`file-detail.tsx:134,96-98`): render a delete
  failure inside the modal while it is open so it is not hidden in inert
  background content. Do not drop existing error feedback during the migration.
- Move only backdrop behavior to `.modal-dialog::backdrop`; reuse the delete
  appearance and `.modal-actions`. Remove `.modal-backdrop` once its only caller
  is migrated, rather than retaining a parallel overlay mechanism.

### Agent-launch adoption

- Replace the outer div at `agent-launch-dialog.tsx:132` with `ModalDialog`;
  retain `open`, the launch form's normal `onSubmit`, all harness/model policy,
  disabled states, errors, and `onStarted` semantics.
- `labelledBy="agent-launch-title"`; initial focus = title ref with
  `tabIndex={-1}`. It exists before asynchronous policies arrive, avoids moving
  focus to the submit button, and does not jump when policies finish loading.
- Escape and Cancel call existing `onCancel`; no prepare/start request is made.
  Success continues through `onStarted`, whose CatalogPage callback unmounts
  the dialog. Failures keep the dialog and its inline error open.
- Add a resolver prop to `AgentLaunchDialogProps` and pass it through from
  CatalogPage: prefer its Start-agent trigger ref, otherwise the same stable
  workspace heading. Both Cancel and Escape restore that trigger when present.
  If successful launch intentionally moves focus to the terminal after closing,
  the helper must not steal it back.
- Add the shared modal surface/backdrop styles to `app.css`. Keep the native
  fixed/centered modal behavior, a bounded viewport height with `overflow:auto`,
  and a viewport-safe width. Do not apply the old fixed backdrop grid rules to
  the dialog itself or force closed dialogs to `display:grid`/`display:block`.
  No portal is needed: top-layer rendering works at the existing DOM location.

## jsdom / Vitest: verified limitations and concrete guidance

### What is present today

- All three named suites opt into jsdom on line 1:
  `src/files/file-detail.test.tsx`, `src/agent/agent-launch-dialog.test.tsx`, and
  `src/catalog/catalog-page.test.tsx` (under `desktop-tauri/`).
- They use manual `createRoot` / `act` and append real containers to the document,
  not Testing Library. File-detail mounts/cleans up at lines 11-18,46-51; agent
  does so at 66-83,106 and 118-139; catalog setup is at 14-19.
- **None currently stubs `showModal` or `close`.** `vite.config.ts:1-30` has no
  test setup file; the scoped source sweep found no shared dialog fixture.
- `desktop-tauri/package.json:25,28` declares jsdom `^26.1.0` / Vitest `^3.2.4`;
  `bun.lock:1179,1737` resolves **jsdom 26.1.0 / Vitest 3.2.6**.
- The pinned [jsdom 26.1.0 WebIDL][jsdom-idl] exposes only reflected `open`;
  `show`, `showModal`, and `close` are commented out. Its
  [implementation class][jsdom-impl] is empty. This is stronger evidence than
  assuming support from the existence of `HTMLDialogElement`.

An unshimmed production call to `showModal()` would therefore fail in the locked
unit-test DOM. Merely changing markup to `<dialog open>` to make tests pass
would remove the real modality and is not an acceptable fix.

### Fixture boundary and example

Add one test-only helper at `desktop-tauri/src/test/dialog-fixture.ts` and install
it in each suite that opens a dialog (and the new shared-component suite).
Prefer explicit per-suite setup over changing unrelated tests globally. Save
and restore the original prototype property descriptors. Because the methods
are absent, do not use `vi.spyOn` on them without defining them first.

The core fixture behavior should be this small:

```ts
// Inside installDialogFixture(); save both descriptors before this block.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    }),
  },
  close: {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      if (!this.open) return
      this.open = false
      // Sufficient for the controlled wrapper; not a browser event-loop model.
      this.dispatchEvent(new Event("close"))
    }),
  },
})
// Return restore(): redefine each saved descriptor, or delete the property
// if it was originally absent. Do not leave prototype patches across suites.
```

This fixture deliberately does **not** focus anything, trap Tab, implement
`inert`, calculate layout, or claim full API conformance. Initial focus and
restoration assertions must exercise the shared helper's actual policy.
Unmount React roots inside `act` **before** restoring prototype methods and
removing containers, including failure paths. Adjust file-detail's existing
`vi.restoreAllMocks()`-before-unmount ordering when installing the fixture;
agent/catalog should consistently unmount roots in teardown, not rely only on
test-body unmounts. These are follow-on test changes, not changes made here.

For Escape, dispatch the event the browser would deliver, not a synthetic key
and an assumption that jsdom implements the default action:

```tsx
trigger.focus() // .click() alone in jsdom is not proof of trigger focus.
await act(async () => { trigger.click() })
const dialog = container.querySelector("dialog")!
expect(dialog.open).toBe(true)
expect(document.activeElement).toBe(cancelButton) // Delete's initial target.

const cancel = new Event("cancel", { cancelable: true })
await act(async () => { dialog.dispatchEvent(cancel) })
expect(cancel.defaultPrevented).toBe(true)
// Await the helper's deferred restore inside act if it schedules one.
expect(document.activeElement).toBe(trigger)
expect(remove).not.toHaveBeenCalled()
```

In agent tests mounted with `open` and a spy-only `onCancel`, assert that Escape
calls the callback once, **then render with `open={false}` or use a stateful
host** before asserting closure/restore. Calling a spy does not update a
controlled prop. Follow the existing `act` style; no new test framework is needed.

### Required follow-on coverage

| Owner | Tests to retain / add |
| --- | --- |
| Shared component | Open/false/unmount, title association, initial target, `cancel` callback once, no callback from controlled close, native close before restore, missing/disabled trigger fallback, repeated open/close, StrictMode replay, no restore after reopening, no overriding intentional workflow focus. |
| File detail | Keep exact-path confirmation and Undo test (`file-detail.test.tsx:94-108`); add initial Cancel focus, Cancel + Escape focus return, no delete on dismiss, failure stays open with visible in-dialog error, success/removal fallback. |
| Agent dialog | Keep harness/model/prompt test (`agent-launch-dialog.test.tsx:44-107`) and no-launch Cancel test (`109-140`); add title focus before/after async policy completion, Escape no-launch, controlled closure/unmount restore, prepare/start failure remains open. |
| Catalog page | Existing tests render FileDetail but do not open either modal; there is no `runtime` agent-launch fixture. Add actual Start-agent open/cancel integration, trigger restoration, and removed-selection fallback. If an always-mounted wrapper is adopted, ensure closed dialogs do not affect existing text/control assertions. |

[Vitest documents jsdom as a simulated browser environment][vitest-environments].
[jsdom explicitly does not perform layout][jsdom-readme]. Passing these tests is
not evidence of native keyboard trapping, top-layer position, backdrop behavior,
real Escape-to-cancel dispatch, or assistive-technology announcements.

## Acceptance, affected assets, and remaining risks

No product build, unit test, browser test, or live Tauri session was run for this
research-only change. Evidence above is source inspection, versioned upstream
implementation, official platform/specification documentation, and the supplied
audit observation. Expected value is deletion of duplicated modal responsibilities
and correction of the reported focus/positioning defects; it is not a measured
performance improvement or an already-verified fix.

Before accepting either implementation, its owner must exercise the real Windows
WebView at **1180×760** (and a smaller supported window): both dialogs visible,
initial focus correct, Tab/Shift+Tab unable to reach app controls, real Escape
closes, Cancel returns focus, and background controls cannot be activated. Check
long content scrolls within the modal, title/controls are announced by a screen
reader, reopening works, errors remain discoverable, and no delete/launch occurs
on dismissal. Also test deletion removing the trigger and successful launch's
chosen terminal-focus behavior. Parent/integration owner runs the repository's
normal renderer test/build gates after the product changes.

| Asset / owner | Planned use and risk | Verification / rollback boundary |
| --- | --- | --- |
| `src/components/modal-dialog.tsx` / first dialog-fix owner | New single lifecycle owner; focus race and controlled/native synchronization are the principal risks. | Shared unit cases above plus real WebView keyboard check; both fixes reuse this owner rather than introduce a second mechanism. |
| `src/files/file-detail.tsx`, `src/agent/agent-launch-dialog.tsx`, `src/catalog/catalog-page.tsx` / respective fix owners | Replace wrappers, supply refs/fallbacks, preserve business callbacks. Keep error feedback inside the active modal. | Existing business tests plus new dismissal/success/error paths; revert a failed product change as a unit, not to a misleading half-native modal. |
| `src/app.css` / dialog fix owners | Reuse surfaces, migrate backdrop and viewport bounds. | Real geometry at configured/minimum sizes; no jsdom geometry claims. Remove obsolete backdrop selector after migration. |
| Named test suites and `src/test/dialog-fixture.ts` / fix owners | Explicit missing-method fixture; no simulated trap/inert/layout. | Restore prototype descriptors and unmount roots; native browser checks remain separate. |
| Runtime support configuration / platform owner | No change here; older macOS remains a release gate, not a hidden fallback. | Establish supported WebKit floor before non-Windows rollout or reopen decision. |

Non-goals: implement either fix, change host file-picker dialogs or `window.confirm`
reload prompts, add a modal library/polyfill, redesign launch/deletion state,
change platform support, benchmark performance, or address other UX findings.
No legacy modal path is intentionally retained once both future migrations land.
This research branch contains only this note; it is a context artifact, not a PR.

## Primary sources

[html-dialog]: https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element
[html-rendering]: https://html.spec.whatwg.org/multipage/rendering.html#flow-content-3
[apg]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
[tauri-webviews]: https://v2.tauri.app/reference/webview-versions/#webview2-windows
[jsdom-idl]: https://github.com/jsdom/jsdom/blob/v26.1.0/lib/jsdom/living/nodes/HTMLDialogElement.webidl
[jsdom-impl]: https://github.com/jsdom/jsdom/blob/v26.1.0/lib/jsdom/living/nodes/HTMLDialogElement-impl.js
[jsdom-readme]: https://github.com/jsdom/jsdom/blob/v26.1.0/README.md#unimplemented-parts-of-the-web-platform
[vitest-environments]: https://v3.vitest.dev/guide/environment.html

- [WHATWG HTML — dialog][html-dialog]: modal opening/closing, focusing, cancellation, and browser-support table.
- [WHATWG HTML — rendering][html-rendering]: `dialog:modal` fixed positioning, bounds, and `::backdrop`.
- [WAI-ARIA APG — modal dialog][apg]: required keyboard behavior, initial focus, and logical focus return.
- [Tauri v2 — WebView versions][tauri-webviews]: Windows WebView2/Chromium and system WebKit boundaries.
- [jsdom v26.1.0 interface][jsdom-idl] and [implementation][jsdom-impl]: exact locked-release API omissions.
- [jsdom v26.1.0 README][jsdom-readme]: layout is outside its scope.
- [Vitest v3 environments][vitest-environments]: per-file environment selection and jsdom environment semantics.
