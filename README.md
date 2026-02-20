# Table Buddy LWC

> **Built on the shoulders of [James Hou's](https://github.com/tsalb) [lwc-utils](https://github.com/tsalb/lwc-utils).** The SOQL Datatable architecture and patterns from that project served as the foundation for this implementation.

Visual configurator and runtime datatable component for Salesforce standard and custom objects with inline editing, custom cell types, configurable actions, and Flow Screen support.

## What's Included

### LWC Components

- **`tableBuddy`** — Runtime datatable component that renders SOQL queries from saved configurations. Supports `$record.FieldName`, `$recordId`, and `$CurrentUserId` merge fields on Record Pages. Features inline editing, row/table actions, Fuse.js-powered fuzzy search, per-field sort controls, configurable row selection (none, single, multi), and native SLDS related list styling. Available on App Pages, Record Pages, Home Pages, and Flow Screens (outputs `selectedRowsJson`).
- **`tableBuddyConfigurator`** — Two-panel admin UI for building and previewing table configs. Select objects, toggle field visibility, edit labels, drag-and-drop reorder fields, configure sort behavior, set WHERE clauses, manage actions (table, overflow, and row), configure lookup display, toggle inline editing per field, and see a live preview. Includes context record lookup for resolving `$record.FieldName` merge tokens in the preview.
- **`tableBuddyDatatable`** — Extended `lightning-datatable` with four custom cell types: `customName` (clickable record links with compound name support), `customPicklist` (RecordType-aware picklist rendering), `customLookup` (configurable reference field display), and `customFormula` (HTML formula rendering).
- **`tableBuddyEditableCell`** — Generic inline edit wrapper for custom cell types with edit/view mode toggling, mass editing support, and draft value tracking.
- **`tableBuddyNameCell`** / **`tableBuddyPicklistCell`** / **`tableBuddyLookupCell`** / **`tableBuddyFormulaCell`** — Individual custom cell renderers for their respective field types.
- **`tableBuddyFlowModal`** — LWC-native modal for launching Flow actions with input variables (SelectedRows, FirstSelectedRow, UniqueBoundary, SourceRecordId).
- **`tableBuddyActionModal`** — Modal for launching custom LWC components as actions.
- **`tableBuddyEditRowForm`** — Modal wrapping `lightning-record-edit-form` for inline row editing with configurable editable fields.
- **`tableBuddyDeleteRowForm`** — Confirmation modal for row deletion via `uiRecordApi`.
- **`tableBuddyMessageService`** — Boundary-scoped Lightning Message Service wrapper for inter-component communication (row selection, draft values, lookup/picklist config loading, table refresh).
- **`tableBuddyTableService`** — Service module for data flattening, query result processing, draft value updates, and error handling.
- **`tableBuddyFuse`** — Bundled Fuse.js v6.4.6 for fuzzy global search.

### Apex

- **`TableBuddyService`** — Backend service handling CRUD for `Table_Buddy_Config__c`, object/field discovery, SOQL execution with schema-driven column generation, FLS enforcement, auto-RecordTypeId injection, auto-lookup Name field injection, RecordType mapping for picklists, query validation, and context record field value retrieval.
- **`TableBuddyConfigPicklist`** — `VisualEditor.DynamicPickList` that populates the App Builder dropdown with saved config names.
- **`TableBuddyServiceTests`** — Apex unit tests (90%+ coverage).

### Supporting Metadata

- **`Table_Buddy_Config__c`** — Custom object storing config JSON, object API name, description, and human-readable name.
- **`TableBuddyChannel__c`** — Lightning Message Channel for boundary-scoped inter-component communication (row selection, draft values, lookup/picklist config, refresh events).
- **`Table_Buddy_Admin`** — Permission set with full CRUD on configs, Apex class access, and tab visibility for the configurator.
- **`Table_Buddy_User`** — Permission set with read-only config access and Apex class access (runtime only).

## Deployment

```bash
sf project deploy start --source-dir force-app
```

## Run Tests

```bash
sf apex run test -n TableBuddyServiceTests -r human -w 10
```

## App Builder Usage

1. Assign the `Table_Buddy_Admin` permission set to configurator admins.
2. Open the **Table Buddy Configurator** tab (or add the `tableBuddyConfigurator` component to an App Page).
3. Use the configurator to select an object, configure fields, actions, and display settings, then save.
4. On any App Page, Record Page, Home Page, or Flow Screen, add the `tableBuddy` component and select a saved config from the **Config Name** dropdown.
5. Assign the `Table_Buddy_User` permission set to end users who need runtime access.

## Configurator Features

### Config Management

- **New** — Clear all fields and start a fresh configuration.
- **Clone** — Duplicate the currently loaded config (appends " - Copy" to the name). Save to create an independent copy.
- **Delete** — Remove a saved configuration (with confirmation modal).
- **Save** — Persist the current configuration. New and cloned configs appear immediately in the Load Existing Config dropdown.

### Live Preview with Context Records

When a WHERE clause contains `$record.FieldName` merge tokens, the configurator lets you select a **context object** and **context record** so the preview can resolve those tokens to real values. The flow:

1. Type a WHERE clause with `$record.FieldName` tokens (e.g. `WHERE Industry = $record.Industry`).
2. Search for and select a context object (e.g. Account).
3. Pick a specific record via the record picker.
4. The preview resolves merge tokens and executes the query with actual values.

Context record selections and view state are persisted with the config for convenience on reload.

### Field Management

- **Select All / Deselect All** — Bulk toggle field visibility.
- **Visibility Filter** — Filter the field list to show All Fields, Selected Only, or Unselected Only.
- **Drag-and-Drop Reorder** — Drag fields to control column order in the generated query and table.
- **Custom Labels** — Edit the display label for each field inline.
- **Per-Field Sortable Toggle** — Enable or disable sorting on individual columns.
- **Per-Field Editable Toggle** — Enable or disable inline editing on individual columns.
- **Width Override** — Set custom column widths per field.

### Sort Configuration

- **Default Sort Field** — Select a sortable field to sort by on initial load.
- **Sort Direction** — Ascending or Descending.

### Display Settings

These options are configured in the configurator and stored in the config JSON:

- **Show Record Count** — Displays the row count in parentheses next to the table title (e.g. "My Table (42)").
- **Show Search** — Adds a Fuse.js-powered fuzzy search input that filters across all visible columns.
- **Show Refresh** — Adds a refresh button that re-executes the query.
- **Checkbox Type** — None, Single, or Multi row selection.
- **Use as Related List** — Renders the table using native SLDS page-header markup instead of a lightning-card, matching the look and feel of standard Salesforce related lists.

### Action Configuration

Table Buddy supports three categories of actions, all configured through the configurator UI:

- **Table Actions** — Buttons rendered in the card header (or page-header toolbar in related list mode). These operate on the table as a whole or on selected rows.
- **Overflow Actions** — Additional actions rendered in a dropdown button menu next to the table actions. Identical in capability to table actions, but kept in a menu to reduce toolbar clutter.
- **Row Actions** — Per-row dropdown actions that appear in the last column of each row.

Each action has the following properties:

| Property          | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| **Label**         | Button or menu item text displayed to the user.                |
| **Type**          | `Flow`, `LWC`, or `Built-in` (row actions only).               |
| **Flow API Name** | The API name of the Screen Flow to launch (when type is Flow). |
| **LWC Name**      | The component name to load dynamically (when type is LWC).     |
| **Dialog Size**   | `Small`, `Medium`, or `Large` — controls the modal width.      |
| **Order**         | Numeric position controlling display order.                    |

Row actions additionally support a **Name** field (the action identifier) and two built-in types: `edit_row` and `delete_row`.

---

## Configuring Flow Actions

### Setup Steps

1. **Create a Screen Flow** in Salesforce Setup.
2. **Declare input variables** the Flow needs (all are optional — declare only what you use):

| Variable Name      | Type               | Description                                                                                                                |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `SelectedRows`     | SObject Collection | All selected rows (multi-select) or the single row context (row action).                                                   |
| `FirstSelectedRow` | SObject (single)   | The first row in the selection, or the row the action was triggered on.                                                    |
| `UniqueBoundary`   | Text (String)      | UUID identifying this specific Table Buddy instance. Used to send messages back via the Lightning Message Service channel. |
| `SourceRecordId`   | Text (String)      | The `recordId` of the page the table is placed on (Record Pages only).                                                     |

3. **Add the action in the configurator:**
   - For table/overflow actions: go to the Actions section, click Add Table Action (or Add Overflow Action), set the type to `Flow`, and enter the Flow's API name.
   - For row actions: click Add Row Action, set the type to `Flow`, and enter the Flow's API name.
4. **Save the config.**

### Flow Completion Behavior

- When the Flow finishes with status `FINISHED` or `FINISHED_SCREEN`, Table Buddy **automatically refreshes** the table data.
- If the user closes the modal or the Flow is cancelled, no refresh occurs.
- Flow `outputVariables` are returned but not currently consumed by the runtime — they are available for future extensibility.

### Example: Row-Level Flow Action

A Flow that creates a follow-up Task for a selected Account:

1. Declare input variable `FirstSelectedRow` (SObject, Account).
2. In the Flow, use `{!FirstSelectedRow.Id}` and `{!FirstSelectedRow.Name}` to reference the row.
3. Create the Task record, end with a Screen or just finish.
4. In the configurator, add a Row Action with type `Flow`, label "Create Follow-Up", and the Flow API name.

---

## Configuring Custom LWC Actions

### Setup Steps

1. **Create a Lightning Web Component** in your project.
2. **Declare the `actionPayload` API property** — this is the only required contract:

```javascript
import { api } from 'lwc';

export default class MyCustomAction extends LightningElement {
  @api actionPayload = {};
}
```

The `actionPayload` object contains:

| Property         | Type   | Description                                                                                              |
| ---------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `selectedRows`   | Array  | All selected rows, or a single-element array containing the row the action was triggered on.             |
| `sourceRecordId` | String | The `recordId` of the page the table is placed on (Record Pages only).                                   |
| `uniqueBoundary` | String | UUID identifying this Table Buddy instance, for sending messages back via the Lightning Message Channel. |

3. **Add the action in the configurator:**
   - Set the type to `LWC` and enter the component name (e.g. `c-my-custom-action` becomes `c/myCustomAction` internally — enter the camelCase name as shown in the configurator).
4. **Save the config.**

### Closing the Modal and Triggering Refresh

Your custom LWC is rendered inside a `lightning-modal`. To close it:

```javascript
// Signal completion — Table Buddy will refresh the table
this.dispatchEvent(new CustomEvent('complete'));

// Signal cancellation — no refresh
this.dispatchEvent(new CustomEvent('close'));
```

The parent `tableBuddyActionModal` listens for these events:

- `complete` → closes the modal with `{ status: 'completed' }` → **triggers table refresh**.
- `close` → closes the modal with `{ status: 'cancelled' }` → **no refresh**.

### Example: Custom LWC Row Action

```javascript
import { LightningElement, api } from 'lwc';

export default class QuickNoteAction extends LightningElement {
  @api actionPayload = {};

  get selectedRow() {
    return this.actionPayload?.selectedRows?.[0];
  }

  get recordId() {
    return this.selectedRow?.Id;
  }

  handleSave() {
    // ... your logic ...
    this.dispatchEvent(new CustomEvent('complete'));
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent('close'));
  }
}
```

---

## Built-in Row Actions

Two built-in row actions are available without any additional setup:

### Edit Row (`edit_row`)

- Opens a `lightning-record-edit-form` modal pre-populated with the selected record.
- Only fields marked as **Editable** in the configurator's field list are shown in the form.
- On successful save, the table refreshes automatically.

### Delete Row (`delete_row`)

- Opens a confirmation modal displaying the record name (falls back to `CaseNumber` or `Id`).
- On confirmation, deletes the record via `lightning/uiRecordApi.deleteRecord`.
- On successful deletion, the table refreshes automatically.

To add these in the configurator: Add a Row Action, set the type to `Built-in`, and select `edit_row` or `delete_row`.

---

## Table Refresh via Lightning Message Service

For advanced scenarios where a custom component (LWC or Flow-launched LWC) needs to trigger a Table Buddy refresh programmatically, the `UniqueBoundary` / `uniqueBoundary` value is provided for exactly this purpose.

Table Buddy uses a Lightning Message Channel (`TableBuddyChannel__c`) scoped by a unique boundary UUID. Publishing a message with the key `refreshtablebuddy` on that boundary will trigger a refresh:

```javascript
import { publish, MessageContext } from 'lightning/messageService';
import TABLE_BUDDY_CHANNEL from '@salesforce/messageChannel/TableBuddyChannel__c';

// Inside your custom component:
publish(this.messageContext, TABLE_BUDDY_CHANNEL, {
  boundary: this.actionPayload.uniqueBoundary,
  key: 'refreshtablebuddy',
  value: ''
});
```

This is optional — for most use cases, simply closing the modal with `complete` or finishing a Flow is sufficient to trigger a refresh.

### Lookup Configuration

- **Per-Object Display** — Configure how reference/lookup fields render: title field, subtitle field, and icon name per related object.

## Custom Cell Types

| Type             | Description                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `customName`     | Clickable record link with compound name support (e.g. Contact first + last name) |
| `customPicklist` | RecordType-aware picklist with inline editing and dynamic value loading           |
| `customLookup`   | Reference field with configurable title, subtitle, and icon display               |
| `customFormula`  | Formula field rendering with HTML formula support                                 |

## Merge Field Support

| Token               | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `$recordId`         | Current record ID (on Record Pages)                                         |
| `$CurrentUserId`    | Logged-in user's ID                                                         |
| `$record.FieldName` | Field value from the current record (auto-resolved with type-aware quoting) |

## Flow Screen Support

When placed on a Flow Screen, `tableBuddy` exposes:

- **Input**: `configName` (String) — The saved configuration to render.
- **Output**: `selectedRowsJson` (String) — JSON-serialized array of selected rows, available to subsequent Flow elements.

## Property Note

The `tableBuddy` component uses `configName` (not `tableBuddyConfigName`) as its API property because LWC reserves property names starting with `data` for HTML `data-*` attributes.
