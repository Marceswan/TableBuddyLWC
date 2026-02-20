# TableBuddy Design Document

**Date:** 2026-02-20
**Author:** Marc Swan + Whis
**Status:** Approved

## Overview

TableBuddy is a standalone Salesforce DX project that provides a visual configurator and runtime Lightning Web Component for building dynamic SOQL-powered datatables. It replaces Custom Metadata Type (CMDT) configuration with a single custom object storing JSON, while delivering full feature parity with soqlDatatable from lwc-utils.

**Key Principles:**
- Standard SOQL only (no Data Cloud)
- Standalone project (no lwc-utils dependency)
- JSON-based configuration stored in custom object
- LWC-native modals (no Aura components)
- Full feature parity: inline editing, mass edit, custom cell types, FLS enforcement, merge fields, actions, search, sort

## Data Model

### Custom Object: `Table_Buddy_Config__c`

| Field | Type | Details |
|-------|------|---------|
| Name | Text (80) | Config display name (e.g., "Account Overview") |
| Config_JSON__c | LongTextArea | 131,072 chars. Stores full JSON config |
| Object_API_Name__c | Text (255) | ExternalId. Target SObject API name |
| Description__c | LongTextArea | 500 chars. Admin notes |

### Config JSON Schema

```json
{
  "objectApiName": "Account",
  "fields": [
    {
      "fieldName": "Name",
      "label": "Account Name",
      "visible": true,
      "sortable": true,
      "editable": true,
      "width": null,
      "typeAttributesOverride": null
    }
  ],
  "actions": {
    "tableActions": [
      {
        "order": 1,
        "label": "Bulk Edit",
        "type": "flow",
        "flowApiName": "Account_Bulk_Edit",
        "lwcName": null,
        "dialogSize": "Large"
      }
    ],
    "overflowActions": [
      {
        "order": 1,
        "label": "Export CSV",
        "type": "lwc",
        "lwcName": "c:csvExporter",
        "dialogSize": "Small"
      }
    ],
    "rowActions": [
      {
        "order": 1,
        "name": "edit_row",
        "label": "Edit",
        "type": "builtin"
      },
      {
        "order": 2,
        "name": "delete_row",
        "label": "Delete",
        "type": "builtin"
      },
      {
        "order": 3,
        "name": "run_account_flow",
        "label": "Merge Account",
        "type": "flow",
        "flowApiName": "Account_Merge_Flow",
        "dialogSize": "Large"
      }
    ]
  },
  "lookupConfigs": {
    "Case": {
      "titleField": "CaseNumber",
      "subtitleField": "Subject",
      "iconName": "standard:case"
    },
    "All": {
      "titleField": "Name",
      "subtitleField": null,
      "iconName": "standard:default"
    }
  },
  "querySettings": {
    "whereClause": "WHERE OwnerId = '$CurrentUserId'",
    "limit": 500,
    "defaultSortField": "Name",
    "defaultSortDirection": "asc"
  },
  "displaySettings": {
    "showRecordCount": true,
    "showSearch": true,
    "showRefresh": true,
    "checkboxType": "Multi",
    "editableFields": ["Name", "Industry", "Phone"]
  },
  "viewState": {
    "fieldVisibilityFilter": "all",
    "contextObjectApiName": null,
    "contextObjectLabel": null,
    "contextRecordId": null
  }
}
```

## Configurator LWC: `tableBuddyConfigurator`

**Target:** `lightning__AppPage` only (admin tool)
**Layout:** Two-panel — config form left, live preview right

### Left Panel Sections

#### 1. Config Management (Card Actions)
- **New** — Clear all fields, start fresh
- **Clone** — Duplicate current config with " - Copy" suffix
- **Delete** — Remove config with confirmation modal
- **Save** — Upsert to `Table_Buddy_Config__c`
- **Load Existing Config** — Combobox (non-cacheable fetch so new/cloned configs appear immediately)
- **Config Name** — Required text input
- **Description** — Optional textarea (500 chars)

#### 2. Object Selection
- Search input with EntityDefinition autocomplete (all queryable objects, `WHERE Label LIKE '%term%' AND IsQueryable = true`)
- On select: auto-loads fields via `Schema.describeSObjects()` with FieldDefinition fallback
- Shows "N fields loaded" success indicator
- Clear button to reset

#### 3. Field Configuration
- **Visibility filter** dropdown: All / Selected / Unselected
- **Field search** input (filter by field name or label)
- **Select All / Deselect All** buttons
- **Drag-and-drop table** with columns:
  - Drag handle
  - Visible checkbox
  - Field API Name (read-only, truncated)
  - Custom Label (editable inline)
  - Sortable checkbox
  - Editable checkbox
  - Expand arrow → **Advanced per-field:**
    - Width input (px)
    - Type Attributes Override (JSON textarea)
- Scrollable container (max-height 400px)

#### 4. Lookup Display Configuration
- Only shown when reference fields exist among selected fields
- For each unique reference target object: Title Field, Subtitle Field, Icon Name inputs
- Plus an "All (Fallback)" row

#### 5. Actions Configuration
- **Table Actions** section: Add/Remove/Reorder
  - Each row: Order, Label, Type (Flow/LWC), Flow API Name or LWC Name, Dialog Size
- **Overflow Actions** section: Add/Remove/Reorder
  - Same fields as table actions
- **Row Actions** section: Add/Remove/Reorder
  - Each row: Order, Name (edit_row/delete_row/custom), Label, Type (builtin/flow/lwc), Flow/LWC Name, Dialog Size

#### 6. Query Settings
- WHERE Clause text input (supports `$record.Field`, `$recordId`, `$CurrentUserId` merge tokens)
- Row Limit number input (1-2000)
- Default Sort Field combobox (visible + sortable fields)
- Sort Direction dropdown

#### 7. Display Settings
- Show Record Count checkbox
- Show Search checkbox
- Show Refresh checkbox
- Checkbox Type dropdown (None/Multi/Single)

### Right Panel

#### 1. Context Record Lookup (for merge token preview)
- Context Object search (EntityDefinition autocomplete, excludes Data Cloud `__dll`/`__dlm`)
- Context Record picker (`lightning-record-picker`)
- Merge token status message (e.g., "2 token(s) resolved")

#### 2. Live Preview
- Embedded `<c-table-buddy>` with resolved query, column labels, and config
- Updates in real-time as form changes

## Runtime Component: `tableBuddy`

**Targets:** `lightning__AppPage`, `lightning__RecordPage`, `lightning__HomePage`, `lightning__FlowScreen`

### App Builder Properties

| Property | Type | Details |
|----------|------|---------|
| configName | String | Required. Dynamic picklist via `TableBuddyConfigPicklist` |
| title | String | Card title |
| iconName | String | SLDS icon or 'auto' |
| showRecordCount | Boolean | Override config default |

On Record Pages: auto-receives `recordId` and `objectApiName`.

### Feature Matrix

| Feature | Implementation |
|---------|---------------|
| Dynamic SOQL | Build query from config fields + WHERE + LIMIT |
| FLS Enforcement | `Security.stripInaccessible(AccessType.READABLE)` |
| Schema-Driven Columns | `DisplayType` to datatable type mapping |
| Custom Name Cell | Hyperlinked name fields, compound name support |
| Custom Lookup Cell | Title/Subtitle/Icon from config lookupConfigs |
| Custom Picklist Cell | RecordType-aware picklist values |
| Custom Formula Cell | HYPERLINK/IMAGE HTML rendering |
| Inline Editing | Per-field from config. Draft values. LDS `updateRecord()` |
| Mass Edit | Multi-select + edit applies to all. Boundary messaging |
| Merge Fields | `$recordId`, `$CurrentUserId` (direct), `$record.*`/`$CurrentRecord.*` (LDS wire) |
| Fuse.js Search | Client-side fuzzy, 2+ chars, 0.2 threshold |
| Sort | Default from config + user column sort |
| Table Actions | Flow/LWC launched in LWC `lightning/modal` |
| Row Actions | edit_row, delete_row, custom flow/lwc |
| Checkbox Selection | None/Multi/Single from config |
| Record Count | `(N)` in title |
| Boundary Messaging | UUID per instance, isolates all events |

### Merge Field Resolution Flow

1. Parse `$recordId` / `$CurrentUserId` — direct string substitution
2. Detect `$record.Field` or `$CurrentRecord.Field` — extract field names
3. `@wire(getObjectInfo)` — fetch field metadata for type-aware quoting
4. `@wire(getRecord)` — fetch context record field values
5. Type-aware substitution:
   - Numbers/booleans/dates → raw value
   - Strings/references/picklists → single-quoted
   - Null → `NULL`
6. Execute resolved query

## Apex Backend: `TableBuddyService.cls`

`public inherited sharing class` — standalone, no lwc-utils dependency.

### Methods

| Method | Cacheable | Purpose |
|--------|-----------|---------|
| `getConfigs()` | No | All configs ordered by Name |
| `getConfigByName(String)` | Yes | Single config by exact name |
| `saveConfig(Table_Buddy_Config__c)` | No | Upsert config record |
| `deleteConfig(Id)` | No | Delete config |
| `getTableCache(Map<String, Object>)` | No | Execute SOQL, generate columns, enforce FLS, return data+columns+objectApiName |
| `getColumnData(String queryString, SObjectType)` | — | Schema-driven column generation via DisplayType mapping |
| `getSearchableObjects(String term)` | Yes | EntityDefinition search (excludes `__dll`/`__dlm`) |
| `getObjectFields(String objectApiName)` | No | FieldDefinition query + describeSObjects fallback |
| `getRecordFieldValues(String obj, Id recordId, List<String> fields)` | No | Fetch field values for merge token preview |
| `getQueryExceptionMessage(String query)` | Yes | Validate SOQL syntax |

### Column Generation

DisplayType to datatable type mapping:

| DisplayType | Datatable Type |
|-------------|---------------|
| Picklist | customPicklist |
| Reference | customLookup |
| Boolean | boolean |
| Currency | currency |
| Date | date-local |
| DateTime | date |
| Double, Integer, Long | number |
| Percent | percent |
| Name field | customName |
| HYPERLINK/IMAGE formula | customFormula |
| All others | text |

### FLS Enforcement

```apex
Security.stripInaccessible(AccessType.READABLE, queriedRecords).getRecords();
```

Applied to all non-aggregate query results. Fields that fail FLS check are excluded from column generation.

### Auto-Additions

- RecordTypeId auto-added if object has multiple record types
- Lookup Name fields auto-added for customLookup columns
- `LIMIT 500` auto-appended if query has no LIMIT clause

## Supporting LWC Components

| Component | Purpose |
|-----------|---------|
| `tableBuddyDatatable` | Extends `LightningDatatable` with 4 custom types |
| `tableBuddyNameCell` | Hyperlinked name field (compound name support) |
| `tableBuddyLookupCell` | Lookup display with title/subtitle/icon from config |
| `tableBuddyPicklistCell` | RecordType-aware picklist with draft support |
| `tableBuddyFormulaCell` | HYPERLINK/IMAGE HTML rendering |
| `tableBuddyEditableCell` | Edit mode wrapper, mass edit checkbox |
| `tableBuddyMessageService` | Boundary-based LMS wrapper (OpenChannel pattern) |
| `tableBuddyFlowModal` | LWC `lightning/modal` for Flow actions |
| `tableBuddyActionModal` | LWC `lightning/modal` for custom LWC actions |
| `tableBuddyEditRowForm` | `lightning-record-edit-form` in modal |
| `tableBuddyDeleteRowForm` | Delete confirmation in modal |
| `tableBuddyFuse` | Fuse.js vendored library wrapper |

### Key Architecture Decision: LWC-Native Modals

TableBuddy uses `lightning/modal` (available since API 55.0) instead of Aura `overlayLibrary`. This eliminates all Aura components (DialogService, FlowWrapper, MessageServiceHandler, WorkspaceService). Everything is pure LWC.

## Permission Sets

### `Table_Buddy_Admin`
- Full CRUD + ViewAll + ModifyAll on `Table_Buddy_Config__c`
- Read + Edit on all custom fields
- Tab visibility: Configurator + Config object

### `Table_Buddy_User`
- Read only on `Table_Buddy_Config__c`
- Read only on all custom fields
- No tab visibility (users access via embedded runtime component)

## Project Structure

```
TableBuddyLWC/
├── .forceignore
├── .prettierrc / .prettierignore
├── .gitignore
├── .husky/pre-commit
├── CLAUDE.md
├── README.md
├── package.json
├── eslint.config.js
├── jest.config.js
├── sfdx-project.json (API 65.0)
├── config/project-scratch-def.json
├── docs/plans/
└── force-app/main/default/
    ├── classes/ (TableBuddyService, TableBuddyConfigPicklist, Tests)
    ├── lwc/ (14 components)
    ├── objects/Table_Buddy_Config__c/
    ├── permissionsets/ (Admin, User)
    ├── tabs/ (Configurator, Config object)
    ├── flexipages/ (Configurator page)
    ├── applications/ (Table Buddy app)
    ├── layouts/
    ├── messageChannels/TableBuddyChannel
    └── staticresources/fuse_js/
```

## Testing Strategy

- **Apex:** 90%+ coverage. Test all service methods, FLS enforcement, column generation, edge cases
- **LWC Jest:** Unit tests for configurator logic, runtime merge field resolution, cell type rendering
- **Integration:** Manual testing on scratch org with various objects and configurations
