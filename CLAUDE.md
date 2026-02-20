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
- In an SFDX project, always deploy ONLY the files we're working with directly
- Do NOT delete files unless explicitly told to
