# Life Trace · Stream V4

V4 is a structural rewrite around a small set of primitives:

- **Stream** — the derived life stream.
- **Switch** — start a State at a point in time.
- **Stop** — stop recording from a point in time.
- **Range** — derived automatically between adjacent Switch / Stop events.
- **Point** — a note at one moment.
- **Note** — free text attached to a Point or Range.
- **Boundary** — the time of the event that starts the Range on its right.

The app no longer stores `ranges + current` as primary truth. It stores structural events and derives the Stream from them.

## Main interaction

### Now

- Tap a State: `Switch` now.
- Long-press a State: retroactive `Switch` (5m / 15m / 30m / 1h / exact time).
- `Stop recording`: adds a Stop event.
- `+ Point`: adds a Point Note on the selected day, using the current clock time.

### Stream

- Tap a Range State: choose another State; the change is immediate and undoable.
- Tap a Range Note: edit it inline.
- Tap `···`: insert a historical Switch, clear this Range, or merge it into the previous Range when a Boundary is visible.
- **Clear this Range** means: this interval becomes **Unrecorded**, and its Range Note is removed. A confirmation explains this before clearing; the action can be undone.
- **Merge with previous** removes the divider between the two Ranges, so the previous State or Unrecorded period continues. Their Range Notes are combined.
- Tap a Point Note: edit its text or delete it. Its time is shown on the Stream and is not changed from this editor.
- On desktop, click a Range start time or Boundary to adjust its time, or drag it vertically to move it quickly; release to commit.
- On iPhone, tap a Range start time to open its time control. A Boundary needs a long press; drag to adjust it, or release without moving to open the time control. Short Boundary taps and vertical swipes do not change a time.
- Boundary controls only adjust the event time. They do not delete or merge records.

## Date navigation

To keep Stream navigation quiet and avoid horizontal scrolling:

- narrow/mobile layouts show the latest **3 days**;
- wider layouts show the latest **7 days**;
- all older dates are opened through **History**, using a date picker.

When an older day is selected, the History button displays that selected date.

## State lifecycle

A State used in history no longer has to occupy the live Switch strip forever:

- unused States may be deleted;
- States used by historical events may be **hidden / shown**;
- the built-in Undefined State remains available but can still be renamed and recolored.

## Data model

Export schema: `4`.

```json
{
  "version": 4,
  "states": [],
  "events": [
    {"id":"ev_...","type":"switch","at":0,"stateId":"st_focus","tzOffset":240},
    {"id":"ev_...","type":"stop","at":0,"tzOffset":240}
  ],
  "points": [],
  "rangeNotes": {},
  "settings": {}
}
```

`Range` is derived from adjacent structural events, so inserting, deleting or moving a Switch naturally rebuilds the Stream.

Timezone offsets are retained on newly created Events and Points for future analysis/export. Current rendering still follows the device's local calendar.

## Migration

V1, V2 and V3 data are migrated automatically on first V4 load. The V4 store uses a new localStorage key, so the older store is not overwritten during migration.

## PWA

The Service Worker uses a local-first app-shell strategy:

- cached UI loads immediately;
- a fresh copy is fetched in the background when online;
- the next launch receives the refreshed shell;
- data remains local in localStorage.

Data is scoped to the browser origin. Before moving from localhost to a deployed domain, export a JSON backup; import it after opening the deployed app.

## Local test

```bash
cd life-trace-stream-v4
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080
```

For iPhone/PWA installation, deploy the directory over HTTPS and use Safari → Share → Add to Home Screen.
