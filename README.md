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

- **Table Actions** — Buttons rendered in the card header. Each action can launch a Flow or custom LWC.
- **Overflow Actions** — Additional actions rendered in a button menu dropdown.
- **Row Actions** — Per-row dropdown actions. Includes built-in Edit Row and Delete Row, plus custom Flow or LWC actions.

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
