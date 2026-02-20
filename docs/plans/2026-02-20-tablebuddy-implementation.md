# TableBuddy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Salesforce DX project with a visual configurator and runtime LWC for dynamic SOQL-powered datatables, with full feature parity to soqlDatatable from lwc-utils.

**Architecture:** JSON-based configuration stored in `Table_Buddy_Config__c` custom object. Two main components: `tableBuddyConfigurator` (admin builder with live preview) and `tableBuddy` (runtime renderer). LWC-native modals replace Aura DialogService. Boundary-based messaging isolates multiple instances.

**Tech Stack:** Salesforce DX, LWC (API 65.0), Apex, lightning/modal, Lightning Data Service, Fuse.js

**Reference Projects:**
- `/Users/marc.swan/Documents/Code/360TableLWC` — JSON config pattern, configurator UI, context record lookup
- `/Users/marc.swan/Documents/Code/lwc-utils` — DataTableService schema-driven columns, custom cell types, baseDatatable features, messageService boundary pattern

---

## Phase 1: Project Scaffolding

### Task 1: Create SFDX project configuration files

**Files:**
- Create: `sfdx-project.json`
- Create: `config/project-scratch-def.json`
- Create: `package.json`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Create: `.forceignore`
- Create: `eslint.config.js`
- Create: `jest.config.js`
- Create: `CLAUDE.md`

**Step 1: Create sfdx-project.json**

```json
{
  "packageDirectories": [
    {
      "path": "force-app",
      "default": true
    }
  ],
  "name": "TableBuddyLWC",
  "namespace": "",
  "sfdcLoginUrl": "https://login.salesforce.com",
  "sourceApiVersion": "65.0"
}
```

**Step 2: Create config/project-scratch-def.json**

```json
{
  "orgName": "TableBuddy Dev",
  "edition": "Developer",
  "features": [],
  "settings": {
    "lightningExperienceSettings": {
      "enableS1DesktopEnabled": true
    },
    "mobileSettings": {
      "enableS1EncryptedStorage": false
    }
  }
}
```

**Step 3: Create package.json**

Use 360TableLWC as template. Same devDependencies, same lint-staged config, same scripts.

```json
{
  "name": "table-buddy-lwc",
  "private": true,
  "version": "1.0.0",
  "description": "Visual configurator and runtime LWC for dynamic SOQL-powered Salesforce datatables",
  "scripts": {
    "lint": "eslint **/{aura,lwc}/**/*.js",
    "test": "npm run test:unit",
    "test:unit": "sfdx-lwc-jest",
    "test:unit:watch": "sfdx-lwc-jest --watch",
    "test:unit:debug": "sfdx-lwc-jest --debug",
    "test:unit:coverage": "sfdx-lwc-jest --coverage",
    "prettier": "prettier --write \"**/*.{cls,cmp,component,css,html,js,json,md,page,trigger,xml,yaml,yml}\"",
    "prettier:verify": "prettier --check \"**/*.{cls,cmp,component,css,html,js,json,md,page,trigger,xml,yaml,yml}\"",
    "prepare": "husky || true",
    "precommit": "lint-staged"
  },
  "devDependencies": {
    "@lwc/eslint-plugin-lwc": "^3.1.0",
    "@prettier/plugin-xml": "^3.4.1",
    "@salesforce/eslint-config-lwc": "^4.0.0",
    "@salesforce/eslint-plugin-aura": "^3.0.0",
    "@salesforce/eslint-plugin-lightning": "^2.0.0",
    "@salesforce/sfdx-lwc-jest": "^7.0.2",
    "eslint": "^9.29.0",
    "eslint-plugin-import": "^2.31.0",
    "eslint-plugin-jest": "^28.14.0",
    "husky": "^9.1.7",
    "lint-staged": "^16.1.2",
    "prettier": "^3.5.3",
    "prettier-plugin-apex": "^2.2.6"
  },
  "lint-staged": {
    "**/*.{cls,cmp,component,css,html,js,json,md,page,trigger,xml,yaml,yml}": [
      "prettier --write"
    ],
    "**/{aura,lwc}/**/*.js": [
      "eslint"
    ],
    "**/lwc/**": [
      "sfdx-lwc-jest -- --bail --findRelatedTests --passWithNoTests"
    ]
  }
}
```

**Step 4: Create .prettierrc, .prettierignore, .forceignore, eslint.config.js**

Copy directly from 360TableLWC — identical configs.

`.prettierrc`:
```json
{
  "trailingComma": "none",
  "plugins": [
    "prettier-plugin-apex",
    "@prettier/plugin-xml"
  ],
  "overrides": [
    {
      "files": "**/lwc/**/*.html",
      "options": { "parser": "lwc" }
    },
    {
      "files": "*.{cmp,page,component}",
      "options": { "parser": "html" }
    }
  ]
}
```

`.prettierignore`:
```
**/staticresources/**
.localdevserver
.sfdx
.sf
.vscode
coverage/
```

`.forceignore`:
```
package.xml
**/jsconfig.json
**/.eslintrc.json
**/__tests__/**
```

`eslint.config.js`: Copy from 360TableLWC verbatim.

**Step 5: Create jest.config.js**

```js
const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');
module.exports = {
  ...jestConfig,
  moduleNameMapper: {
    '^c/tableBuddyFuse$': '<rootDir>/force-app/main/default/lwc/tableBuddyFuse/tableBuddyFuse.js'
  }
};
```

**Step 6: Create CLAUDE.md**

```markdown
# CLAUDE.md

## Project Overview

TableBuddy — standalone Salesforce DX project for visual datatable configuration and runtime rendering.
Single package, API version 65.0.

## Commands

```bash
# Lint & Format
npm run lint
npm run prettier:verify
npm run prettier

# LWC Jest Tests
npm test
npx sfdx-lwc-jest -- --runTestsMatching <pattern>

# Deploy specific files
sf project deploy start -p force-app/main/default/classes/TableBuddyService.cls
sf project deploy start -p force-app/main/default/lwc/tableBuddy

# Run Apex Tests
sf apex run test -n TableBuddyServiceTests -r human -w 10
```

## Architecture

- `Table_Buddy_Config__c` — Custom object storing JSON config
- `tableBuddyConfigurator` — Admin builder UI (AppPage only)
- `tableBuddy` — Runtime component (AppPage, RecordPage, HomePage, FlowScreen)
- `TableBuddyService.cls` — Apex backend for CRUD, SOQL execution, schema-driven columns
- LWC-native `lightning/modal` for all dialogs (no Aura components)

## Code Style

- ESLint: `@salesforce/eslint-config-lwc/recommended`
- Prettier: no trailing commas, LWC HTML parser, apex/xml plugins
- Minimum Apex code coverage: 90%
```

**Step 7: Install dependencies and commit**

```bash
cd /Users/marc.swan/Documents/Code/TableBuddyLWC
npm install
npx husky init
echo 'npx lint-staged' > .husky/pre-commit
git add sfdx-project.json config/ package.json package-lock.json .prettierrc .prettierignore .forceignore eslint.config.js jest.config.js CLAUDE.md .husky/
git commit -m "feat: scaffold SFDX project with tooling configuration"
```

---

## Phase 2: Salesforce Metadata

### Task 2: Create custom object and fields

**Files:**
- Create: `force-app/main/default/objects/Table_Buddy_Config__c/Table_Buddy_Config__c.object-meta.xml`
- Create: `force-app/main/default/objects/Table_Buddy_Config__c/fields/Config_JSON__c.field-meta.xml`
- Create: `force-app/main/default/objects/Table_Buddy_Config__c/fields/Description__c.field-meta.xml`
- Create: `force-app/main/default/objects/Table_Buddy_Config__c/fields/Object_API_Name__c.field-meta.xml`

**Step 1: Create object definition**

`Table_Buddy_Config__c.object-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <actionOverrides>
        <actionName>Accept</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>CancelEdit</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>Clone</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>Delete</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>Edit</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>List</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>New</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>SaveEdit</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>Tab</actionName>
        <type>Default</type>
    </actionOverrides>
    <actionOverrides>
        <actionName>View</actionName>
        <type>Default</type>
    </actionOverrides>
    <deploymentStatus>Deployed</deploymentStatus>
    <description>Stores Table Buddy configurations as JSON. Used by the Table Buddy Configurator UI and read by tableBuddy runtime component.</description>
    <enableActivities>false</enableActivities>
    <enableBulkApi>true</enableBulkApi>
    <enableReports>true</enableReports>
    <enableSearch>true</enableSearch>
    <enableSharing>true</enableSharing>
    <enableStreamingApi>true</enableStreamingApi>
    <label>Table Buddy Config</label>
    <nameField>
        <label>Config Name</label>
        <type>Text</type>
    </nameField>
    <pluralLabel>Table Buddy Configs</pluralLabel>
    <sharingModel>ReadWrite</sharingModel>
</CustomObject>
```

**Step 2: Create field definitions**

`Config_JSON__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Config_JSON__c</fullName>
    <description>Full table configuration stored as JSON</description>
    <externalId>false</externalId>
    <label>Config JSON</label>
    <length>131072</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>LongTextArea</type>
    <visibleLines>10</visibleLines>
</CustomField>
```

`Description__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Description__c</fullName>
    <description>Admin notes on where/how this config is intended to be used</description>
    <externalId>false</externalId>
    <inlineHelpText>Describe where and how this configuration is intended to be used</inlineHelpText>
    <label>Description</label>
    <length>500</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>LongTextArea</type>
    <visibleLines>3</visibleLines>
</CustomField>
```

`Object_API_Name__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Object_API_Name__c</fullName>
    <description>The SObject API name for quick lookup</description>
    <externalId>true</externalId>
    <label>Object API Name</label>
    <length>255</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

**Step 3: Commit**

```bash
git add force-app/main/default/objects/
git commit -m "feat: add Table_Buddy_Config__c custom object with fields"
```

### Task 3: Create message channel, permission sets, tabs, app, layout, and flexipage

**Files:**
- Create: `force-app/main/default/messageChannels/TableBuddyChannel.messageChannel-meta.xml`
- Create: `force-app/main/default/permissionsets/Table_Buddy_Admin.permissionset-meta.xml`
- Create: `force-app/main/default/permissionsets/Table_Buddy_User.permissionset-meta.xml`
- Create: `force-app/main/default/tabs/Table_Buddy_Configurator.tab-meta.xml`
- Create: `force-app/main/default/tabs/Table_Buddy_Config__c.tab-meta.xml`
- Create: `force-app/main/default/applications/Table_Buddy.app-meta.xml`
- Create: `force-app/main/default/layouts/Table_Buddy_Config__c-Table Buddy Config Layout.layout-meta.xml`
- Create: `force-app/main/default/flexipages/Table_Buddy_Configurator.flexipage-meta.xml`

**Step 1: Create message channel**

`TableBuddyChannel.messageChannel-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<LightningMessageChannel xmlns="http://soap.sforce.com/2006/04/metadata">
    <masterLabel>Table Buddy Channel</masterLabel>
    <isExposed>true</isExposed>
    <description>Internal messaging channel for Table Buddy component communication</description>
    <lightningMessageFields>
        <fieldName>boundary</fieldName>
        <description>Unique boundary identifier to scope messages to a specific table instance</description>
    </lightningMessageFields>
    <lightningMessageFields>
        <fieldName>key</fieldName>
        <description>Message action identifier</description>
    </lightningMessageFields>
    <lightningMessageFields>
        <fieldName>value</fieldName>
        <description>Message payload</description>
    </lightningMessageFields>
</LightningMessageChannel>
```

**Step 2: Create permission sets**

`Table_Buddy_Admin.permissionset-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>Full CRUD access to Table Buddy Config and Configurator tab</description>
    <hasActivationRequired>false</hasActivationRequired>
    <label>Table Buddy Admin</label>
    <objectPermissions>
        <allowCreate>true</allowCreate>
        <allowDelete>true</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>true</modifyAllRecords>
        <object>Table_Buddy_Config__c</object>
        <viewAllRecords>true</viewAllRecords>
    </objectPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Table_Buddy_Config__c.Config_JSON__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Table_Buddy_Config__c.Description__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Table_Buddy_Config__c.Object_API_Name__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <tabSettings>
        <tab>Table_Buddy_Configurator</tab>
        <visibility>Visible</visibility>
    </tabSettings>
    <tabSettings>
        <tab>Table_Buddy_Config__c</tab>
        <visibility>Visible</visibility>
    </tabSettings>
</PermissionSet>
```

`Table_Buddy_User.permissionset-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>Read-only access to Table Buddy Config for runtime table rendering</description>
    <hasActivationRequired>false</hasActivationRequired>
    <label>Table Buddy User</label>
    <objectPermissions>
        <allowCreate>false</allowCreate>
        <allowDelete>false</allowDelete>
        <allowEdit>false</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>false</modifyAllRecords>
        <object>Table_Buddy_Config__c</object>
        <viewAllRecords>false</viewAllRecords>
    </objectPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Table_Buddy_Config__c.Config_JSON__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Table_Buddy_Config__c.Description__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Table_Buddy_Config__c.Object_API_Name__c</field>
        <readable>true</readable>
    </fieldPermissions>
</PermissionSet>
```

**Step 3: Create tabs**

`Table_Buddy_Configurator.tab-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomTab xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>Table Buddy visual table configurator</description>
    <flexiPage>Table_Buddy_Configurator</flexiPage>
    <label>Table Buddy Configurator</label>
    <motif>Custom73: Wrench</motif>
</CustomTab>
```

`Table_Buddy_Config__c.tab-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomTab xmlns="http://soap.sforce.com/2006/04/metadata">
    <customObject>true</customObject>
    <motif>Custom62: Chalkboard</motif>
</CustomTab>
```

**Step 4: Create app**

`Table_Buddy.app-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomApplication xmlns="http://soap.sforce.com/2006/04/metadata">
    <defaultLandingTab>Table_Buddy_Configurator</defaultLandingTab>
    <formFactors>
        <formFactor>Large</formFactor>
    </formFactors>
    <isNavAutoTempTabsDisabled>false</isNavAutoTempTabsDisabled>
    <isNavPersonalizationDisabled>false</isNavPersonalizationDisabled>
    <isNavTabPersistenceDisabled>false</isNavTabPersistenceDisabled>
    <label>Table Buddy</label>
    <navType>Standard</navType>
    <tabs>Table_Buddy_Configurator</tabs>
    <tabs>Table_Buddy_Config__c</tabs>
    <uiType>Lightning</uiType>
</CustomApplication>
```

**Step 5: Create layout**

`Table_Buddy_Config__c-Table Buddy Config Layout.layout-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Layout xmlns="http://soap.sforce.com/2006/04/metadata">
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>Information</label>
        <layoutColumns>
            <layoutItems>
                <behavior>Required</behavior>
                <field>Name</field>
            </layoutItems>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Object_API_Name__c</field>
            </layoutItems>
        </layoutColumns>
        <layoutColumns>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>OwnerId</field>
            </layoutItems>
        </layoutColumns>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
    <layoutSections>
        <customLabel>true</customLabel>
        <detailHeading>true</detailHeading>
        <editHeading>true</editHeading>
        <label>Description</label>
        <layoutColumns>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Description__c</field>
            </layoutItems>
        </layoutColumns>
        <style>OneColumn</style>
    </layoutSections>
    <layoutSections>
        <customLabel>true</customLabel>
        <detailHeading>true</detailHeading>
        <editHeading>true</editHeading>
        <label>Configuration</label>
        <layoutColumns>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Config_JSON__c</field>
            </layoutItems>
        </layoutColumns>
        <style>OneColumn</style>
    </layoutSections>
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>System Information</label>
        <layoutColumns>
            <layoutItems>
                <behavior>Readonly</behavior>
                <field>CreatedById</field>
            </layoutItems>
        </layoutColumns>
        <layoutColumns>
            <layoutItems>
                <behavior>Readonly</behavior>
                <field>LastModifiedById</field>
            </layoutItems>
        </layoutColumns>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
</Layout>
```

**Step 6: Create flexipage (placeholder — configurator LWC comes later)**

`Table_Buddy_Configurator.flexipage-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentName>c:tableBuddyConfigurator</componentName>
            </componentInstance>
        </itemInstances>
        <name>main</name>
        <type>Region</type>
    </flexiPageRegions>
    <masterLabel>Table Buddy Configurator</masterLabel>
    <template>
        <name>flexipage:defaultAppHomeTemplate</name>
    </template>
    <type>AppPage</type>
</FlexiPage>
```

**Step 7: Commit**

```bash
git add force-app/main/default/messageChannels/ force-app/main/default/permissionsets/ force-app/main/default/tabs/ force-app/main/default/applications/ force-app/main/default/layouts/ force-app/main/default/flexipages/
git commit -m "feat: add message channel, permission sets, tabs, app, layout, and flexipage"
```

---

## Phase 3: Apex Backend

### Task 4: Create TableBuddyService.cls

**Files:**
- Create: `force-app/main/default/classes/TableBuddyService.cls`
- Create: `force-app/main/default/classes/TableBuddyService.cls-meta.xml`

**Step 1: Create meta.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>65.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

**Step 2: Create TableBuddyService.cls**

This merges 360Table's CRUD/field discovery/context record methods with lwc-utils DataTableService's schema-driven column generation and FLS enforcement. Key differences from both:
- No Data Cloud support (no probe queries, no `__dll`/`__dlm` field detection)
- Includes full DisplayType-to-datatable-type mapping from DataTableService
- Includes lookup name field resolution, RecordType handling, formula field detection
- Includes aggregate query and date function support
- FLS enforcement via `Security.stripInaccessible`

```apex
public inherited sharing class TableBuddyService {

  // ── Constants ────────────────────────────────────────────────

  public static final Map<Schema.DisplayType, String> DISPLAY_TYPE_TO_DATATABLE_TYPE_MAP = new Map<Schema.DisplayType, String>{
    Schema.DisplayType.address => 'text',
    Schema.DisplayType.anytype => 'text',
    Schema.DisplayType.base64 => 'text',
    Schema.DisplayType.Boolean => 'boolean',
    Schema.DisplayType.Combobox => 'text',
    Schema.DisplayType.Currency => 'currency',
    Schema.DisplayType.Date => 'date-local',
    Schema.DisplayType.DateTime => 'date',
    Schema.DisplayType.Double => 'number',
    Schema.DisplayType.Email => 'email',
    Schema.DisplayType.EncryptedString => 'text',
    Schema.DisplayType.Long => 'number',
    Schema.DisplayType.Location => 'location',
    Schema.DisplayType.ID => 'text',
    Schema.DisplayType.Integer => 'number',
    Schema.DisplayType.MultiPicklist => 'text',
    Schema.DisplayType.Percent => 'percent',
    Schema.DisplayType.Phone => 'phone',
    Schema.DisplayType.Picklist => 'customPicklist',
    Schema.DisplayType.Reference => 'customLookup',
    Schema.DisplayType.String => 'text',
    Schema.DisplayType.TextArea => 'text',
    Schema.DisplayType.Time => 'text',
    Schema.DisplayType.URL => 'url'
  };

  private static final Set<String> AGGREGATE_QUERY_DELIMITERS = new Set<String>{
    'avg', 'count', 'count_distinct', 'min', 'max', 'sum'
  };

  private static final Set<String> DATE_FUNCTION_DELIMITERS = new Set<String>{
    'calendar_month', 'calendar_quarter', 'calendar_year',
    'day_in_month', 'day_in_week', 'day_in_year', 'day_only',
    'fiscal_month', 'fiscal_quarter', 'fiscal_year',
    'hour_in_day', 'week_in_month', 'week_in_year'
  };

  private static final Integer ROW_LIMITER = 500;
  private static Set<Id> RECORD_TYPE_IDS { private get; private set; }
  private static Map<String, String> LOOKUP_FIELD_TO_NAME_FIELD_MAP = new Map<String, String>();

  // ── Config CRUD ──────────────────────────────────────────────

  @AuraEnabled
  public static List<Table_Buddy_Config__c> getConfigs() {
    return [
      SELECT Id, Name, Description__c, Object_API_Name__c, Config_JSON__c
      FROM Table_Buddy_Config__c
      ORDER BY Name ASC
    ];
  }

  @AuraEnabled(cacheable=true)
  public static Table_Buddy_Config__c getConfigByName(String configName) {
    List<Table_Buddy_Config__c> configs = [
      SELECT Id, Name, Description__c, Object_API_Name__c, Config_JSON__c
      FROM Table_Buddy_Config__c
      WHERE Name = :configName
      LIMIT 1
    ];
    return configs.isEmpty() ? null : configs[0];
  }

  @AuraEnabled
  public static Table_Buddy_Config__c saveConfig(Table_Buddy_Config__c config) {
    upsert config;
    return config;
  }

  @AuraEnabled
  public static void deleteConfig(Id configId) {
    delete [SELECT Id FROM Table_Buddy_Config__c WHERE Id = :configId];
  }

  // ── Field Discovery ──────────────────────────────────────────

  @AuraEnabled
  public static List<Map<String, String>> getObjectFields(String objectApiName) {
    if (String.isBlank(objectApiName)) {
      return new List<Map<String, String>>();
    }
    List<Map<String, String>> fields = getFieldsViaFieldDefinition(objectApiName);
    if (!fields.isEmpty()) {
      return fields;
    }
    return getFieldsViaDescribe(objectApiName);
  }

  @TestVisible
  private static List<Map<String, String>> getFieldsViaFieldDefinition(String objectApiName) {
    List<Map<String, String>> fields = new List<Map<String, String>>();
    if (String.isBlank(objectApiName)) {
      return fields;
    }
    try {
      for (FieldDefinition fd : [
        SELECT QualifiedApiName, Label
        FROM FieldDefinition
        WHERE EntityDefinition.QualifiedApiName = :objectApiName
        ORDER BY QualifiedApiName ASC
      ]) {
        fields.add(new Map<String, String>{
          'fieldName' => fd.QualifiedApiName,
          'label' => fd.Label
        });
      }
    } catch (Exception e) {
      System.debug('FieldDefinition query failed for ' + objectApiName + ': ' + e.getMessage());
    }
    return fields;
  }

  @TestVisible
  private static List<Map<String, String>> getFieldsViaDescribe(String objectApiName) {
    List<Map<String, String>> fields = new List<Map<String, String>>();
    if (String.isBlank(objectApiName)) {
      return fields;
    }
    try {
      Schema.DescribeSObjectResult[] describes = Schema.describeSObjects(new List<String>{ objectApiName });
      if (!describes.isEmpty()) {
        Map<String, Schema.SObjectField> fieldMap = describes[0].fields.getMap();
        List<String> fieldNames = new List<String>(fieldMap.keySet());
        fieldNames.sort();
        for (String fieldName : fieldNames) {
          Schema.DescribeFieldResult dfr = fieldMap.get(fieldName).getDescribe();
          fields.add(new Map<String, String>{
            'fieldName' => dfr.getName(),
            'label' => dfr.getLabel()
          });
        }
      }
    } catch (Exception e) {
      System.debug('describeSObjects failed for ' + objectApiName + ': ' + e.getMessage());
    }
    return fields;
  }

  // ── Table Cache (Schema-Driven SOQL Execution) ──────────────

  @AuraEnabled
  public static Map<String, Object> getTableCache(Map<String, Object> tableRequest) {
    if (!tableRequest.containsKey('queryString')) {
      throw new TableBuddyServiceException('Missing Query.');
    }
    String queryString = (String) tableRequest.get('queryString');
    String objectName = queryString.substringAfter(' FROM ').split(' ').get(0);
    SObject queryObject = Schema.getGlobalDescribe().get(objectName).newSObject();

    // Auto-add RecordTypeId if multi-type object
    if (recordTypeIdsForObject(objectName).size() > 1 && !queryString.containsIgnoreCase('RecordTypeId')) {
      queryString = addFieldToQueryString('RecordTypeId', queryString);
    }

    // Generate columns first (populates LOOKUP_FIELD_TO_NAME_FIELD_MAP)
    LOOKUP_FIELD_TO_NAME_FIELD_MAP = new Map<String, String>();
    List<Map<String, Object>> tableColumns = getColumnData(queryString, queryObject);

    // Auto-add lookup Name fields
    if (!LOOKUP_FIELD_TO_NAME_FIELD_MAP.isEmpty()) {
      for (String lookupNameField : LOOKUP_FIELD_TO_NAME_FIELD_MAP.values()) {
        if (!queryString.containsIgnoreCase(lookupNameField) && !isAggregateQuery(queryString)) {
          queryString = addFieldToQueryString(lookupNameField, queryString);
        }
      }
    }

    // Execute query with FLS enforcement
    List<SObject> tableData = getSObjectsWithAllowedFields(queryString);

    return new Map<String, Object>{
      'tableData' => tableData,
      'tableColumns' => tableColumns,
      'objectApiName' => objectName
    };
  }

  // ── Column Generation ────────────────────────────────────────

  @TestVisible
  private static List<Map<String, Object>> getColumnData(String queryString, SObject queriedSObject) {
    String soqlFields = queryString.subString(
        queryString.indexOfIgnoreCase('select') + 7,
        queryString.indexOfIgnoreCase(' from ')
      ).trim();
    List<String> soqlColumns = soqlFields.split('[,]{1}[\\s]*');
    List<Map<String, Object>> tableColumns = new List<Map<String, Object>>();
    Map<String, Schema.SObjectField> fieldMap = queriedSObject.getSObjectType().getDescribe().fields.getMap();

    for (String fieldName : soqlColumns) {
      Schema.SObjectType currentSObjectType = queriedSObject.getSObjectType();
      Schema.DescribeFieldResult field;
      Map<String, Object> fieldColumn = new Map<String, Object>();

      if (fieldname == 'created') {
        continue;
      }

      // Aggregate queries and date functions
      if (isAggregateQuery(fieldName) || isDateFunction(fieldName)) {
        String aggLabel = getExpressionFieldLabel(fieldName);
        Schema.DisplayType displayType = isAggregateQuery(fieldName) ? Schema.DisplayType.INTEGER : Schema.DisplayType.STRING;
        fieldColumn.put('label', aggLabel);
        fieldColumn.put('type', DISPLAY_TYPE_TO_DATATABLE_TYPE_MAP.get(displayType));
        fieldColumn.put('fieldName', getExpressionFieldName(fieldName, aggLabel));
        tableColumns.add(fieldColumn);
        continue;
      }

      // Parent relationships
      if (fieldName.contains('.')) {
        String parentReference = fieldName.contains('__r')
          ? fieldName.substringBeforeLast('__r.') + '__c'
          : fieldName.substringBeforeLast('.') + 'Id';
        Schema.SObjectType referenceTo = fieldMap.get(parentReference).getDescribe().getReferenceTo().get(0);
        currentSObjectType = referenceTo;
        field = referenceTo.getDescribe().fields.getMap().get(fieldName.substringAfterLast('.')).getDescribe();
      } else {
        field = fieldMap.get(fieldName).getDescribe();
      }

      // FLS check
      if (!field.isAccessible()) {
        continue;
      }

      String flatFieldName = fieldName.contains('.') ? fieldName.replace('.', '_') : fieldName;
      fieldColumn.put('label', field.getLabel());
      fieldColumn.put('type', DISPLAY_TYPE_TO_DATATABLE_TYPE_MAP.get(field.getType()));
      fieldColumn.put('fieldName', flatFieldName);

      // Name fields -> customName
      if (fieldName.equalsIgnoreCase('name') || fieldName.substringAfterLast('.').equalsIgnoreCase('name')) {
        fieldColumn.put('type', 'customName');
        Boolean isNameFieldForPrimaryObject =
          currentSObjectType.getDescribe().getName() == queriedSObject.getSObjectType().getDescribe().getName();
        String hrefFieldValue = isNameFieldForPrimaryObject
          ? currentSObjectType.getDescribe().getName() + '_Id'
          : fieldName.substringBeforeLast('.') + '_Id';
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('href', new Map<String, Object>{ 'fieldName' => hrefFieldValue });
        typeAttributes.put('target', '_parent');
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      String columnType = String.valueOf(fieldColumn.get('type'));

      // Formula fields with HYPERLINK/IMAGE
      if (field.isCalculated() && columnType.equalsIgnoreCase('text')) {
        String formulaValue = field.getCalculatedFormula();
        if (String.isNotBlank(formulaValue) &&
            (formulaValue.containsIgnoreCase('hyperlink') || formulaValue.containsIgnoreCase('image'))) {
          fieldColumn.put('type', 'customFormula');
          Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
          typeAttributes.put('isHtmlFormula', true);
          fieldColumn.put('typeAttributes', typeAttributes);
        }
      }

      if (columnType.equalsIgnoreCase('location')) {
        throw new TableBuddyServiceException('Geolocation fields must be queried with __Longitude__s and __Latitude__s suffixes.');
      }

      // Date typeAttributes
      if (columnType.equalsIgnoreCase('date-local')) {
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('year', 'numeric');
        typeAttributes.put('month', 'numeric');
        typeAttributes.put('day', 'numeric');
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      if (columnType.equalsIgnoreCase('date')) {
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('year', 'numeric');
        typeAttributes.put('month', 'numeric');
        typeAttributes.put('day', 'numeric');
        typeAttributes.put('hour', 'numeric');
        typeAttributes.put('minute', 'numeric');
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      // All custom types get these
      if (columnType.startsWithIgnoreCase('custom')) {
        String fieldNameParticle = fieldName.contains('.') ? fieldName.substringAfterLast('.') : fieldName;
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('columnName', fieldNameParticle);
        typeAttributes.put('objectApiName', currentSObjectType.getDescribe().getName());
        typeAttributes.put('fieldApiName', fieldNameParticle);
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      // Picklist RecordType handling
      Boolean hasRecordTypes = recordTypeIdsForObject(currentSObjectType.getDescribe().getName()).size() > 1;
      if (columnType.equalsIgnoreCase('customPicklist') && hasRecordTypes) {
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('picklistRecordTypeId', new Map<String, Object>{ 'fieldName' => 'RecordTypeId' });
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      // Lookup name field resolution
      if (columnType.equalsIgnoreCase('customLookup')) {
        Boolean isCustomObjectLookup = field.getReferenceTo().get(0).getDescribe().isCustom();
        String cleanFieldName = isCustomObjectLookup ? fieldName : fieldName.removeEnd('Id');
        String lookupNameField = getLookupNameField(field, cleanFieldName);
        String flattenedNameField = lookupNameField.replace('.', '_');
        String hrefFieldValue = cleanFieldName.replace('__c', '__r') + '_Id';

        LOOKUP_FIELD_TO_NAME_FIELD_MAP.put(cleanFieldName, lookupNameField);

        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('href', new Map<String, Object>{ 'fieldName' => hrefFieldValue });
        typeAttributes.put('target', '_parent');
        typeAttributes.put('displayValue', new Map<String, Object>{ 'fieldName' => flattenedNameField });
        typeAttributes.put('referenceObjectApiName', field.getReferenceTo().get(0).getDescribe().getName());
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      tableColumns.add(fieldColumn);
    }
    return tableColumns;
  }

  // ── Query Validation ──────────────────────────────────────────

  @AuraEnabled(cacheable=true)
  public static String getQueryExceptionMessage(String queryString) {
    String errorMessage;
    try {
      Database.query(queryString);
    } catch (System.QueryException e) {
      errorMessage = e.getMessage();
    }
    return errorMessage;
  }

  // ── Context Record Lookups (Configurator Preview) ────────────

  @AuraEnabled(cacheable=true)
  public static List<Map<String, String>> getSearchableObjects(String searchTerm) {
    String likeClause = String.isBlank(searchTerm) ? '%' : '%' + String.escapeSingleQuotes(searchTerm.trim()) + '%';
    List<Map<String, String>> results = new List<Map<String, String>>();
    for (EntityDefinition ed : [
      SELECT QualifiedApiName, Label
      FROM EntityDefinition
      WHERE Label LIKE :likeClause AND IsQueryable = true
      ORDER BY Label ASC
      LIMIT 25
    ]) {
      String api = ed.QualifiedApiName;
      if (api.endsWith('__dll') || api.endsWith('__dlm')) {
        continue;
      }
      results.add(new Map<String, String>{ 'apiName' => api, 'label' => ed.Label });
      if (results.size() >= 20) {
        break;
      }
    }
    return results;
  }

  @AuraEnabled
  public static Map<String, Object> getRecordFieldValues(String objectApiName, String recordId, List<String> fieldNames) {
    if (String.isBlank(objectApiName) || String.isBlank(recordId) || fieldNames == null || fieldNames.isEmpty()) {
      return new Map<String, Object>();
    }
    List<String> safeFields = new List<String>();
    Pattern fieldPattern = Pattern.compile('^[a-zA-Z][a-zA-Z0-9_]*(__[a-zA-Z0-9]+)?$');
    for (String fn : fieldNames) {
      if (String.isNotBlank(fn) && fieldPattern.matcher(fn.trim()).matches()) {
        safeFields.add(String.escapeSingleQuotes(fn.trim()));
      }
    }
    if (safeFields.isEmpty()) {
      return new Map<String, Object>();
    }
    String fieldList = String.join(safeFields, ', ');
    String safeObject = String.escapeSingleQuotes(objectApiName.trim());
    String safeRecordId = String.escapeSingleQuotes(recordId.trim());
    String query = 'SELECT ' + fieldList + ' FROM ' + safeObject + ' WHERE Id = \'' + safeRecordId + '\' LIMIT 1';

    List<SObject> rows;
    try {
      rows = Database.query(query);
    } catch (Exception e) {
      throw new TableBuddyServiceException('Failed to query record fields: ' + e.getMessage());
    }
    if (rows.isEmpty()) {
      return new Map<String, Object>();
    }
    Map<String, Object> result = new Map<String, Object>();
    Map<String, Object> populated = rows[0].getPopulatedFieldsAsMap();
    for (String fn : safeFields) {
      result.put(fn, populated.containsKey(fn) ? populated.get(fn) : null);
    }
    return result;
  }

  // ── RecordType Map (for picklist cells) ──────────────────────

  @AuraEnabled(cacheable=true)
  public static Map<Id, Id> getRecordTypeIdMap(List<Id> recordIds) {
    Map<Id, Id> recordTypeIdMap = new Map<Id, Id>();
    Set<String> objectNames = new Set<String>();
    for (Id recordId : recordIds) {
      objectNames.add(recordId.getSobjectType().getDescribe().getName());
    }
    if (objectNames.size() != 1) {
      throw new TableBuddyServiceException('Only one type of SObject is allowed.');
    }
    String objectName = new List<String>(objectNames)[0];
    if (recordTypeIdsForObject(objectName).size() > 1) {
      String queryString = 'SELECT Id, RecordTypeId FROM ' + objectName + ' LIMIT ' + ROW_LIMITER;
      for (SObject obj : Database.query(queryString)) {
        recordTypeIdMap.put(obj.Id, (Id) obj.get('RecordTypeId'));
      }
    }
    return recordTypeIdMap;
  }

  // ── Private Helpers ──────────────────────────────────────────

  private static Map<String, Object> getTypeAttributes(Map<String, Object> fieldColumn) {
    if (fieldColumn.get('typeAttributes') == null) {
      fieldColumn.put('typeAttributes', new Map<String, Object>());
    }
    return (Map<String, Object>) fieldColumn.get('typeAttributes');
  }

  private static Set<Id> recordTypeIdsForObject(String objectName) {
    if (RECORD_TYPE_IDS == null) {
      RECORD_TYPE_IDS = Schema.getGlobalDescribe()
        .get(objectName).getDescribe().getRecordTypeInfosById().keySet();
    }
    return RECORD_TYPE_IDS;
  }

  private static String addFieldToQueryString(String field, String queryString) {
    String queryStart = queryString.substringBefore(' FROM ');
    String queryEnd = queryString.substringAfter(' FROM ');
    return queryStart + ', ' + String.escapeSingleQuotes(field) + ' FROM ' + queryEnd;
  }

  private static Boolean isAggregateQuery(String queryString) {
    for (String delim : AGGREGATE_QUERY_DELIMITERS) {
      if (queryString.containsIgnoreCase(delim + '(')) {
        return true;
      }
    }
    return false;
  }

  private static Boolean isDateFunction(String fieldName) {
    for (String delim : DATE_FUNCTION_DELIMITERS) {
      if (fieldName.containsIgnoreCase(delim + '(')) {
        return true;
      }
    }
    return false;
  }

  private static Integer expressionNameCounter = 0;

  private static String getExpressionFieldLabel(String fieldName) {
    Integer expressionEnd = fieldName.indexOf(')') + 1;
    Boolean hasAlias = expressionEnd != fieldName.length();
    return hasAlias ? fieldName.substring(expressionEnd, fieldName.length()).trim() : fieldName;
  }

  private static String getExpressionFieldName(String fieldName, String fieldLabel) {
    if (fieldName == fieldLabel) {
      String baseString = 'expr{0}';
      String returnString = String.format(baseString, new List<String>{ expressionNameCounter.format() });
      expressionNameCounter++;
      return returnString;
    } else if (fieldName.indexOf(')') + 1 < fieldName.length()) {
      return fieldLabel;
    }
    return fieldName;
  }

  private static Boolean shouldAddLimit(String queryString) {
    return isAggregateQuery(queryString) ? queryString.containsIgnoreCase('group by') : true;
  }

  private static String getLookupNameField(Schema.DescribeFieldResult field, String cleanFieldName) {
    Schema.SObjectField nameField;
    for (Schema.SObjectField curField : field.getReferenceTo().get(0).getDescribe().fields.getMap().values()) {
      if (curField.getDescribe().isNameField()) {
        nameField = curField;
        break;
      }
    }
    return cleanFieldName.replace('__c', '__r') + '.' + nameField.getDescribe().getName();
  }

  private static List<SObject> getSObjectsWithAllowedFields(String queryString) {
    if (!queryString.containsIgnoreCase(' LIMIT ') && shouldAddLimit(queryString)) {
      queryString += ' LIMIT ' + ROW_LIMITER;
    }
    try {
      List<SObject> queriedRecords = Database.query(queryString);
      if (isAggregateQuery(queryString)) {
        return queriedRecords;
      }
      return Security.stripInaccessible(AccessType.READABLE, queriedRecords).getRecords();
    } catch (Exception e) {
      throw new TableBuddyServiceException(e.getMessage());
    }
  }

  @TestVisible
  private class TableBuddyServiceException extends Exception {}
}
```

**Step 3: Commit**

```bash
git add force-app/main/default/classes/TableBuddyService.*
git commit -m "feat: add TableBuddyService Apex with CRUD, field discovery, schema-driven columns, and FLS"
```

### Task 5: Create TableBuddyConfigPicklist.cls

**Files:**
- Create: `force-app/main/default/classes/TableBuddyConfigPicklist.cls`
- Create: `force-app/main/default/classes/TableBuddyConfigPicklist.cls-meta.xml`

**Step 1: Create the class**

```apex
public class TableBuddyConfigPicklist extends VisualEditor.DynamicPickList {

  public override VisualEditor.DataRow getDefaultValue() {
    return new VisualEditor.DataRow('-- None --', '');
  }

  public override VisualEditor.DynamicPickListRows getValues() {
    VisualEditor.DynamicPickListRows rows = new VisualEditor.DynamicPickListRows();
    rows.addRow(new VisualEditor.DataRow('-- None --', ''));
    for (Table_Buddy_Config__c config : [
      SELECT Name FROM Table_Buddy_Config__c ORDER BY Name ASC
    ]) {
      rows.addRow(new VisualEditor.DataRow(config.Name, config.Name));
    }
    return rows;
  }
}
```

**Step 2: Commit**

```bash
git add force-app/main/default/classes/TableBuddyConfigPicklist.*
git commit -m "feat: add TableBuddyConfigPicklist dynamic picklist for App Builder"
```

### Task 6: Create TableBuddyServiceTests.cls

**Files:**
- Create: `force-app/main/default/classes/TableBuddyServiceTests.cls`
- Create: `force-app/main/default/classes/TableBuddyServiceTests.cls-meta.xml`

**Step 1: Create comprehensive test class**

Model after `Data360ConfigServiceTests.cls` but add tests for the schema-driven column generation features (from DataTableService). Target 90%+ coverage.

Test categories:
1. **Config CRUD** — getConfigs, getConfigByName, saveConfig, deleteConfig
2. **Field Discovery** — getObjectFields, getFieldsViaFieldDefinition, getFieldsViaDescribe
3. **Table Cache** — getTableCache with various SOQL queries
4. **Column Generation** — customName, customLookup, customPicklist detection, parent relationships, FLS
5. **Query Validation** — getQueryExceptionMessage
6. **Context Record Lookups** — getSearchableObjects, getRecordFieldValues
7. **RecordType Map** — getRecordTypeIdMap
8. **Picklist** — TableBuddyConfigPicklist getDefaultValue, getValues
9. **Edge Cases** — blank inputs, null inputs, invalid queries, aggregate queries

```apex
@IsTest
private class TableBuddyServiceTests {

  @TestSetup
  static void setup() {
    Table_Buddy_Config__c config = new Table_Buddy_Config__c(
      Name = 'Test Config',
      Description__c = 'Test description',
      Object_API_Name__c = 'Account',
      Config_JSON__c = '{"objectApiName":"Account","fields":[{"fieldName":"Name","label":"Name","visible":true}]}'
    );
    insert config;
  }

  // ── Config CRUD Tests ──────────────────────────────────────

  @IsTest
  static void getConfigs_returns_all_configs() {
    Test.startTest();
    List<Table_Buddy_Config__c> configs = TableBuddyService.getConfigs();
    Test.stopTest();
    System.assertEquals(1, configs.size());
    System.assertEquals('Test Config', configs[0].Name);
  }

  @IsTest
  static void getConfigByName_returns_matching_config() {
    Test.startTest();
    Table_Buddy_Config__c config = TableBuddyService.getConfigByName('Test Config');
    Test.stopTest();
    System.assertNotEquals(null, config);
    System.assertEquals('Test Config', config.Name);
    System.assertEquals('Test description', config.Description__c);
  }

  @IsTest
  static void getConfigByName_returns_null_for_missing() {
    Test.startTest();
    Table_Buddy_Config__c config = TableBuddyService.getConfigByName('Nonexistent');
    Test.stopTest();
    System.assertEquals(null, config);
  }

  @IsTest
  static void saveConfig_inserts_new_config() {
    Table_Buddy_Config__c newConfig = new Table_Buddy_Config__c(
      Name = 'New Config',
      Description__c = 'New description',
      Object_API_Name__c = 'Contact',
      Config_JSON__c = '{"objectApiName":"Contact","fields":[]}'
    );
    Test.startTest();
    Table_Buddy_Config__c result = TableBuddyService.saveConfig(newConfig);
    Test.stopTest();
    System.assertNotEquals(null, result.Id);
    System.assertEquals('New Config', result.Name);
  }

  @IsTest
  static void saveConfig_updates_existing_config() {
    Table_Buddy_Config__c existing = [SELECT Id, Name, Description__c FROM Table_Buddy_Config__c LIMIT 1];
    existing.Description__c = 'Updated description';
    Test.startTest();
    Table_Buddy_Config__c result = TableBuddyService.saveConfig(existing);
    Test.stopTest();
    Table_Buddy_Config__c refreshed = [SELECT Description__c FROM Table_Buddy_Config__c WHERE Id = :result.Id];
    System.assertEquals('Updated description', refreshed.Description__c);
  }

  @IsTest
  static void deleteConfig_removes_config() {
    Table_Buddy_Config__c existing = [SELECT Id FROM Table_Buddy_Config__c LIMIT 1];
    Test.startTest();
    TableBuddyService.deleteConfig(existing.Id);
    Test.stopTest();
    List<Table_Buddy_Config__c> remaining = [SELECT Id FROM Table_Buddy_Config__c];
    System.assertEquals(0, remaining.size());
  }

  // ── Field Discovery Tests ──────────────────────────────────

  @IsTest
  static void getObjectFields_returns_fields_for_standard_object() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getObjectFields('Account');
    Test.stopTest();
    System.assert(fields.size() > 0, 'Expected at least one field');
    System.assert(fields[0].containsKey('fieldName'));
    System.assert(fields[0].containsKey('label'));
  }

  @IsTest
  static void getObjectFields_returns_empty_for_blank() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getObjectFields('');
    Test.stopTest();
    System.assertEquals(0, fields.size());
  }

  @IsTest
  static void getFieldsViaFieldDefinition_returns_empty_for_null() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getFieldsViaFieldDefinition(null);
    Test.stopTest();
    System.assertEquals(0, fields.size());
  }

  @IsTest
  static void getFieldsViaDescribe_returns_fields_for_standard_object() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getFieldsViaDescribe('Account');
    Test.stopTest();
    System.assert(fields.size() > 0);
  }

  @IsTest
  static void getFieldsViaDescribe_returns_empty_for_null() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getFieldsViaDescribe(null);
    Test.stopTest();
    System.assertEquals(0, fields.size());
  }

  @IsTest
  static void getFieldsViaDescribe_returns_empty_for_invalid_object() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getFieldsViaDescribe('FakeObject__xyz');
    Test.stopTest();
    System.assertEquals(0, fields.size());
  }

  // ── Table Cache Tests ──────────────────────────────────────

  @IsTest
  static void getTableCache_returns_data_and_columns() {
    Account testAcc = new Account(Name = 'Cache Test');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{ 'queryString' => 'SELECT Id, Name FROM Account LIMIT 5' }
    );
    Test.stopTest();
    System.assertNotEquals(null, result.get('tableData'));
    System.assertNotEquals(null, result.get('tableColumns'));
    System.assertEquals('Account', result.get('objectApiName'));
  }

  @IsTest
  static void getTableCache_throws_for_missing_query() {
    try {
      TableBuddyService.getTableCache(new Map<String, Object>());
      System.assert(false, 'Expected exception');
    } catch (Exception e) {
      System.assert(e.getMessage().contains('Missing Query'));
    }
  }

  @IsTest
  static void getTableCache_handles_parent_relationship() {
    Contact c = new Contact(LastName = 'Parent Test');
    insert c;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{ 'queryString' => 'SELECT Id, Account.Name FROM Contact LIMIT 5' }
    );
    Test.stopTest();
    System.assertNotEquals(null, result.get('tableColumns'));
  }

  @IsTest
  static void getTableCache_generates_name_column_type() {
    Account testAcc = new Account(Name = 'Name Type Test');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{ 'queryString' => 'SELECT Id, Name FROM Account LIMIT 1' }
    );
    Test.stopTest();
    List<Map<String, Object>> columns = (List<Map<String, Object>>) result.get('tableColumns');
    Boolean foundCustomName = false;
    for (Map<String, Object> col : columns) {
      if (col.get('type') == 'customName') {
        foundCustomName = true;
      }
    }
    System.assert(foundCustomName, 'Expected customName type for Name field');
  }

  @IsTest
  static void getTableCache_generates_lookup_column_type() {
    Account testAcc = new Account(Name = 'Lookup Type Test');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{ 'queryString' => 'SELECT Id, OwnerId FROM Account LIMIT 1' }
    );
    Test.stopTest();
    List<Map<String, Object>> columns = (List<Map<String, Object>>) result.get('tableColumns');
    Boolean foundCustomLookup = false;
    for (Map<String, Object> col : columns) {
      if (col.get('type') == 'customLookup') {
        foundCustomLookup = true;
      }
    }
    System.assert(foundCustomLookup, 'Expected customLookup type for OwnerId field');
  }

  @IsTest
  static void getTableCache_auto_adds_limit() {
    Account testAcc = new Account(Name = 'Limit Test');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{ 'queryString' => 'SELECT Id FROM Account' }
    );
    Test.stopTest();
    List<SObject> data = (List<SObject>) result.get('tableData');
    System.assert(data.size() <= 500);
  }

  @IsTest
  static void getTableCache_handles_invalid_query() {
    try {
      TableBuddyService.getTableCache(
        new Map<String, Object>{ 'queryString' => 'SELECT InvalidField FROM Account' }
      );
      System.assert(false, 'Expected exception');
    } catch (Exception e) {
      System.assertNotEquals(null, e.getMessage());
    }
  }

  // ── Query Validation Tests ─────────────────────────────────

  @IsTest
  static void getQueryExceptionMessage_returns_null_for_valid() {
    System.assertEquals(null, TableBuddyService.getQueryExceptionMessage('SELECT Id FROM Account LIMIT 1'));
  }

  @IsTest
  static void getQueryExceptionMessage_returns_error_for_invalid() {
    String result = TableBuddyService.getQueryExceptionMessage('SELECT FakeField FROM Account');
    System.assertNotEquals(null, result);
  }

  // ── Searchable Objects Tests ───────────────────────────────

  @IsTest
  static void getSearchableObjects_returns_results() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects('Account');
    Test.stopTest();
    System.assert(results.size() > 0);
    Boolean foundAccount = false;
    for (Map<String, String> r : results) {
      if (r.get('apiName') == 'Account') {
        foundAccount = true;
      }
    }
    System.assert(foundAccount);
  }

  @IsTest
  static void getSearchableObjects_handles_blank() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects('');
    Test.stopTest();
    System.assert(results.size() > 0);
    System.assert(results.size() <= 20);
  }

  @IsTest
  static void getSearchableObjects_handles_null() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects(null);
    Test.stopTest();
    System.assert(results.size() > 0);
  }

  @IsTest
  static void getSearchableObjects_excludes_dc_objects() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects('');
    Test.stopTest();
    for (Map<String, String> r : results) {
      String apiName = r.get('apiName');
      System.assert(!apiName.endsWith('__dll'));
      System.assert(!apiName.endsWith('__dlm'));
    }
  }

  @IsTest
  static void getSearchableObjects_returns_empty_for_gibberish() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects('zzzzznonexistent999');
    Test.stopTest();
    System.assertEquals(0, results.size());
  }

  // ── Record Field Values Tests ──────────────────────────────

  @IsTest
  static void getRecordFieldValues_returns_values() {
    Account a = new Account(Name = 'Context Test', Industry = 'Technology');
    insert a;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      'Account', a.Id, new List<String>{ 'Name', 'Industry' }
    );
    Test.stopTest();
    System.assertEquals('Context Test', result.get('Name'));
    System.assertEquals('Technology', result.get('Industry'));
  }

  @IsTest
  static void getRecordFieldValues_returns_empty_for_blank_object() {
    Map<String, Object> result = TableBuddyService.getRecordFieldValues('', 'someId', new List<String>{ 'Name' });
    System.assertEquals(0, result.size());
  }

  @IsTest
  static void getRecordFieldValues_returns_empty_for_null_record_id() {
    Map<String, Object> result = TableBuddyService.getRecordFieldValues('Account', null, new List<String>{ 'Name' });
    System.assertEquals(0, result.size());
  }

  @IsTest
  static void getRecordFieldValues_returns_empty_for_empty_fields() {
    Account a = new Account(Name = 'Test');
    insert a;
    Map<String, Object> result = TableBuddyService.getRecordFieldValues('Account', a.Id, new List<String>());
    System.assertEquals(0, result.size());
  }

  @IsTest
  static void getRecordFieldValues_returns_empty_for_nonexistent() {
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      'Account', '001000000000000AAA', new List<String>{ 'Name' }
    );
    System.assertEquals(0, result.size());
  }

  @IsTest
  static void getRecordFieldValues_filters_invalid_field_names() {
    Account a = new Account(Name = 'Filter Test');
    insert a;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      'Account', a.Id, new List<String>{ 'Name', 'DROP TABLE', '' }
    );
    Test.stopTest();
    System.assert(result.containsKey('Name'));
    System.assertEquals('Filter Test', result.get('Name'));
  }

  // ── RecordType Map Tests ───────────────────────────────────

  @IsTest
  static void getRecordTypeIdMap_returns_map_for_valid_ids() {
    Account a = new Account(Name = 'RT Test');
    insert a;
    Test.startTest();
    Map<Id, Id> result = TableBuddyService.getRecordTypeIdMap(new List<Id>{ a.Id });
    Test.stopTest();
    // May or may not have multiple record types depending on org
    System.assertNotEquals(null, result);
  }

  // ── Picklist Tests ─────────────────────────────────────────

  @IsTest
  static void picklist_getDefaultValue_returns_none() {
    TableBuddyConfigPicklist picklist = new TableBuddyConfigPicklist();
    Test.startTest();
    VisualEditor.DataRow defaultRow = picklist.getDefaultValue();
    Test.stopTest();
    System.assertEquals('-- None --', defaultRow.getLabel());
    System.assertEquals('', defaultRow.getValue());
  }

  @IsTest
  static void picklist_getValues_includes_saved_configs() {
    TableBuddyConfigPicklist picklist = new TableBuddyConfigPicklist();
    Test.startTest();
    VisualEditor.DynamicPickListRows rows = picklist.getValues();
    Test.stopTest();
    System.assert(rows.size() >= 2, 'Expected at least 2 rows (None + test config)');
  }

  // ── Aggregate Query Tests ──────────────────────────────────

  @IsTest
  static void getTableCache_handles_aggregate_query() {
    Account testAcc = new Account(Name = 'Agg Test', Industry = 'Technology');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{ 'queryString' => 'SELECT Industry, COUNT(Id) cnt FROM Account GROUP BY Industry' }
    );
    Test.stopTest();
    System.assertNotEquals(null, result.get('tableData'));
  }

  // ── Date Column Type Tests ─────────────────────────────────

  @IsTest
  static void getTableCache_generates_date_column_type() {
    Opportunity opp = new Opportunity(Name = 'Date Test', CloseDate = Date.today(), StageName = 'Prospecting');
    insert opp;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{ 'queryString' => 'SELECT Id, CloseDate FROM Opportunity LIMIT 1' }
    );
    Test.stopTest();
    List<Map<String, Object>> columns = (List<Map<String, Object>>) result.get('tableColumns');
    Boolean foundDateLocal = false;
    for (Map<String, Object> col : columns) {
      if (col.get('type') == 'date-local') {
        foundDateLocal = true;
      }
    }
    System.assert(foundDateLocal, 'Expected date-local type for CloseDate');
  }
}
```

**Step 2: Deploy and run tests**

```bash
sf project deploy start -p force-app/main/default/objects/Table_Buddy_Config__c,force-app/main/default/classes/
sf apex run test -n TableBuddyServiceTests -r human -w 10
```

Expected: All tests pass, 90%+ coverage.

**Step 3: Commit**

```bash
git add force-app/main/default/classes/TableBuddyServiceTests.*
git commit -m "feat: add comprehensive TableBuddyServiceTests with 90%+ coverage"
```

---

## Phase 4: Core LWC Infrastructure

### Task 7: Create tableBuddyMessageService LWC

**Files:**
- Create: `force-app/main/default/lwc/tableBuddyMessageService/tableBuddyMessageService.js`
- Create: `force-app/main/default/lwc/tableBuddyMessageService/tableBuddyMessageService.html`
- Create: `force-app/main/default/lwc/tableBuddyMessageService/tableBuddyMessageService.js-meta.xml`

Port from lwc-utils `messageService` but use `TableBuddyChannel` instead of `OpenChannel`. Remove Aura DialogService/WorkspaceService proxying. Keep boundary-based isolation, toast notifications, and LMS publish/subscribe. Add `openModal` method that dispatches a custom event instead of LMS (for LWC-native modal handling).

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/messageService/messageService.js`

**Step 1: Implement, Step 2: Commit**

```bash
git add force-app/main/default/lwc/tableBuddyMessageService/
git commit -m "feat: add tableBuddyMessageService with boundary-based LMS isolation"
```

### Task 8: Create tableBuddyFuse static resource and LWC wrapper

**Files:**
- Create: `force-app/main/default/staticresources/fuse_js.resource-meta.xml`
- Create: `force-app/main/default/staticresources/fuse_js/fuse.min.js` (download Fuse.js 6.x)
- Create: `force-app/main/default/lwc/tableBuddyFuse/tableBuddyFuse.js`
- Create: `force-app/main/default/lwc/tableBuddyFuse/tableBuddyFuse.js-meta.xml`

Port the `fuseBasic` wrapper pattern from lwc-utils. Load Fuse.js via `loadScript` from static resource.

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/fuseBasic/`

**Step 1: Download Fuse.js, create wrapper, commit**

```bash
git add force-app/main/default/staticresources/ force-app/main/default/lwc/tableBuddyFuse/
git commit -m "feat: add Fuse.js static resource and tableBuddyFuse wrapper"
```

### Task 9: Create tableBuddyTableService utility module

**Files:**
- Create: `force-app/main/default/lwc/tableBuddyTableService/tableBuddyTableService.js`
- Create: `force-app/main/default/lwc/tableBuddyTableService/tableBuddyTableService.js-meta.xml`

Port from lwc-utils `tableService` + `tableServiceUtils`. Methods:
- `checkQueryException(queryString)` — Apex call wrapper
- `fetchTableCache(requestConfig)` — Apex call + flatten results
- `updateDraftValues(draftValues, recordIdToRowNumberMap)` — LDS updateRecord per row
- `flattenQueryResult(listOfObjects, objectApiName)` — Parent relationship flattening
- `createDatatableErrorRow(error, recordInput)` — Error shaping
- `createDataTableError(rows, map)` — Table-level error aggregation

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/tableService/tableService.js` and `tableServiceUtils/tableServiceUtils.js`

**Step 1: Implement, Step 2: Commit**

```bash
git add force-app/main/default/lwc/tableBuddyTableService/
git commit -m "feat: add tableBuddyTableService with SOQL execution, flattening, and draft update utilities"
```

---

## Phase 5: Custom Cell Types

### Task 10: Create tableBuddyFormulaCell

**Files:**
- Create: `force-app/main/default/lwc/tableBuddyFormulaCell/tableBuddyFormulaCell.js`
- Create: `force-app/main/default/lwc/tableBuddyFormulaCell/tableBuddyFormulaCell.html`
- Create: `force-app/main/default/lwc/tableBuddyFormulaCell/tableBuddyFormulaCell.js-meta.xml`

Port from `baseDatatableFormulaCell`. Renders HYPERLINK/IMAGE formula HTML via `lwc:dom="manual"` innerHTML.

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/baseDatatableFormulaCell/`

### Task 11: Create tableBuddyNameCell

Port from `baseDatatableNameCell`. Hyperlinked name field with compound name support, editable pencil icon.

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/baseDatatableNameCell/`

### Task 12: Create tableBuddyPicklistCell

Port from `baseDatatablePicklistCell`. RecordType-aware picklist with draft value tracking, mass edit support.

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/baseDatatablePicklistCell/`

### Task 13: Create tableBuddyLookupCell

Port from `baseDatatableLookupCell`. Dynamic record loading via getRecord wire, title field resolution, configurable display.

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/baseDatatableLookupCell/`

### Task 14: Create tableBuddyEditableCell

Port from `baseDatatableEditableCell`. Edit mode wrapper with mass edit checkbox, click-outside detection, slot-based display/edit switching.

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/baseDatatableEditableCell/`

### Task 15: Create tableBuddyDatatable (extended LightningDatatable)

Port from `baseDatatableExtension`. Extends `LightningDatatable` with 4 custom types: `customName`, `customPicklist`, `customLookup`, `customFormula`. Each type maps to the corresponding cell component and passes typeAttributes.

**Reference:** `/Users/marc.swan/Documents/Code/lwc-utils/utils-core/main/default/lwc/baseDatatableExtension/`

**Commit all cell types together:**

```bash
git add force-app/main/default/lwc/tableBuddyFormulaCell/ force-app/main/default/lwc/tableBuddyNameCell/ force-app/main/default/lwc/tableBuddyPicklistCell/ force-app/main/default/lwc/tableBuddyLookupCell/ force-app/main/default/lwc/tableBuddyEditableCell/ force-app/main/default/lwc/tableBuddyDatatable/
git commit -m "feat: add custom cell types and extended datatable with customName, customLookup, customPicklist, customFormula"
```

---

## Phase 6: Modal Components

### Task 16: Create tableBuddyFlowModal

**Files:**
- Create: `force-app/main/default/lwc/tableBuddyFlowModal/tableBuddyFlowModal.js`
- Create: `force-app/main/default/lwc/tableBuddyFlowModal/tableBuddyFlowModal.html`
- Create: `force-app/main/default/lwc/tableBuddyFlowModal/tableBuddyFlowModal.js-meta.xml`

Uses `lightning/modal` to launch a Flow. Replaces Aura FlowWrapper. The modal renders `lightning-flow` component, starts flow with inputVariables, and closes on `FINISHED` status.

### Task 17: Create tableBuddyActionModal

Generic LWC modal for hosting custom LWC components in actions. Uses `lightning/modal` with dynamic component creation via `lwc:component`.

### Task 18: Create tableBuddyEditRowForm

Modal with `lightning-record-edit-form` for inline row editing. Pre-fills field values from selected row.

### Task 19: Create tableBuddyDeleteRowForm

Delete confirmation modal. Calls LDS `deleteRecord()` on confirm.

**Commit all modals together:**

```bash
git add force-app/main/default/lwc/tableBuddyFlowModal/ force-app/main/default/lwc/tableBuddyActionModal/ force-app/main/default/lwc/tableBuddyEditRowForm/ force-app/main/default/lwc/tableBuddyDeleteRowForm/
git commit -m "feat: add LWC-native modal components for flow, action, edit row, and delete row"
```

---

## Phase 7: Runtime Component

### Task 20: Create tableBuddy runtime LWC

**Files:**
- Create: `force-app/main/default/lwc/tableBuddy/tableBuddy.js`
- Create: `force-app/main/default/lwc/tableBuddy/tableBuddy.html`
- Create: `force-app/main/default/lwc/tableBuddy/tableBuddy.css`
- Create: `force-app/main/default/lwc/tableBuddy/tableBuddy.js-meta.xml`

This is the main runtime component. It combines:
- **Config loading** from `Table_Buddy_Config__c` (like data360Table)
- **Schema-driven column generation** from Apex (like soqlDatatable + baseDatatable)
- **Merge field resolution** ($recordId, $CurrentUserId, $record.*/$CurrentRecord.*) (like soqlDatatable)
- **Fuse.js search**, sort, refresh, record count (like baseDatatable)
- **Inline editing** with draft values and mass edit (like baseDatatable)
- **Table/Row actions** from JSON config (replacing CMDT) launched via LWC modals
- **Checkbox selection** (multi/single/none)
- **Boundary-based messaging** for multi-instance isolation

**Meta.xml targets:**
```xml
<targets>
    <target>lightning__AppPage</target>
    <target>lightning__RecordPage</target>
    <target>lightning__HomePage</target>
    <target>lightning__FlowScreen</target>
</targets>
<targetConfigs>
    <targetConfig targets="lightning__AppPage,lightning__HomePage">
        <property name="configName" label="Table Buddy Config" type="String" datasource="apex://TableBuddyConfigPicklist" required="true" />
        <property name="title" label="Title" type="String" />
        <property name="iconName" label="Icon Name" type="String" />
    </targetConfig>
    <targetConfig targets="lightning__RecordPage">
        <property name="configName" label="Table Buddy Config" type="String" datasource="apex://TableBuddyConfigPicklist" required="true" />
        <property name="title" label="Title" type="String" />
        <property name="iconName" label="Icon Name" type="String" />
    </targetConfig>
    <targetConfig targets="lightning__FlowScreen">
        <property name="configName" label="Table Buddy Config" type="String" role="inputOnly" />
        <property name="title" label="Title" type="String" role="inputOnly" />
        <property name="selectedRows" label="Selected Rows" type="{sobject[]}" role="outputOnly" />
        <property name="firstSelectedRow" label="First Selected Row" type="{sobject}" role="outputOnly" />
    </targetConfig>
</targetConfigs>
```

**Key implementation notes:**
- On `connectedCallback`: if `configName` provided, load config via `getConfigByName`. Parse JSON. Build SOQL from visible fields + WHERE + LIMIT. Handle merge fields. Execute via `tableBuddyTableService.fetchTableCache()`.
- If `queryString` provided directly (configurator preview mode), skip config load and execute directly.
- Actions read from JSON config `actions` property, not CMDT.
- Lookup display configs read from JSON config `lookupConfigs` property.
- Column overrides (typeAttributesOverride) applied from field-level config.

**Commit:**

```bash
git add force-app/main/default/lwc/tableBuddy/
git commit -m "feat: add tableBuddy runtime component with full datatable rendering, merge fields, actions, and inline editing"
```

---

## Phase 8: Configurator Component

### Task 21: Create tableBuddyConfigurator LWC

**Files:**
- Create: `force-app/main/default/lwc/tableBuddyConfigurator/tableBuddyConfigurator.js`
- Create: `force-app/main/default/lwc/tableBuddyConfigurator/tableBuddyConfigurator.html`
- Create: `force-app/main/default/lwc/tableBuddyConfigurator/tableBuddyConfigurator.css`
- Create: `force-app/main/default/lwc/tableBuddyConfigurator/tableBuddyConfigurator.js-meta.xml`

This is the largest component. Port from `data360Configurator` and extend with:
1. **Config Management** — New/Clone/Delete/Save (same as 360Table)
2. **Object Selection** — EntityDefinition search (same as 360Table context object search, but for primary object)
3. **Field Configuration** — Drag-and-drop table (same as 360Table) + editable checkbox + advanced expand (new)
4. **Lookup Display Configuration** — New section for reference field display configs
5. **Actions Configuration** — New section with add/remove/reorder for table, overflow, and row actions
6. **Query Settings** — WHERE clause with merge tokens, limit, default sort (same as 360Table)
7. **Display Settings** — Checkboxes and dropdown (new)
8. **Context Record Lookup** — Right panel, same as 360Table
9. **Live Preview** — Embedded `<c-table-buddy>` (same pattern as 360Table)

**Key differences from 360Table configurator:**
- Field search input (filter fields by name/label)
- Editable checkbox per field
- Advanced expand per field (width, typeAttributes JSON)
- Lookup display config section
- Full actions configuration UI
- Display settings section (checkboxType, showSearch, showRefresh)
- Uses EntityDefinition search for primary object (not text input)

**Reference:** `/Users/marc.swan/Documents/Code/360TableLWC/force-app/main/default/lwc/data360Configurator/`

**Commit:**

```bash
git add force-app/main/default/lwc/tableBuddyConfigurator/
git commit -m "feat: add tableBuddyConfigurator with full visual builder, actions config, and live preview"
```

---

## Phase 9: Integration Testing and Deployment

### Task 22: Deploy to scratch org and test

**Step 1: Create scratch org**

```bash
sf org create scratch -f config/project-scratch-def.json -a TableBuddyDev -d 7
```

**Step 2: Deploy all metadata**

```bash
sf project deploy start -p force-app
```

**Step 3: Assign permission set**

```bash
sf org assign permset -n Table_Buddy_Admin
```

**Step 4: Run all Apex tests**

```bash
sf apex run test -n TableBuddyServiceTests -r human -w 10
```

Expected: All tests pass, 90%+ coverage.

**Step 5: Manual testing checklist**

1. Open Table Buddy app
2. Navigate to Configurator tab
3. Search for "Account" object, select it
4. Verify fields load
5. Toggle visibility, reorder via drag-and-drop
6. Add table action (Flow type)
7. Add row action (edit_row builtin)
8. Set WHERE clause with `$CurrentUserId`
9. Set limit to 10
10. Save config as "Account Overview"
11. Navigate to any App Page, add `tableBuddy` component
12. Select "Account Overview" config
13. Verify table renders with correct columns, actions, and data
14. Test search, sort, refresh
15. Test inline editing and save
16. Place on Record Page, test `$record.Id` merge field

### Task 23: Final commit and push

```bash
git add -A
git commit -m "feat: complete TableBuddy v1.0 with configurator, runtime, and full test coverage"
git push origin main
```

---

## Implementation Order Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1 | Project scaffolding |
| 2 | 2-3 | Salesforce metadata (object, fields, perms, tabs, app) |
| 3 | 4-6 | Apex backend (service, picklist, tests) |
| 4 | 7-9 | Core LWC infrastructure (message service, fuse, table service) |
| 5 | 10-15 | Custom cell types + extended datatable |
| 6 | 16-19 | Modal components (flow, action, edit row, delete row) |
| 7 | 20 | Runtime component (tableBuddy) |
| 8 | 21 | Configurator component (tableBuddyConfigurator) |
| 9 | 22-23 | Integration testing and deployment |

**Total: 23 tasks across 9 phases**

Each LWC component in Phases 4-8 should be implemented by reading the corresponding reference file from lwc-utils or 360TableLWC and adapting it to TableBuddy's patterns (TableBuddy naming, TableBuddyChannel message channel, JSON-based config instead of CMDT, lightning/modal instead of Aura overlay).
