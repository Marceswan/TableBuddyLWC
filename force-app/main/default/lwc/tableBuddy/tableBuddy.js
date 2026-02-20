import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getRecord } from 'lightning/uiRecordApi';
import Id from '@salesforce/user/Id';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getConfigByName from '@salesforce/apex/TableBuddyService.getConfigByName';
import getRecordTypeIdMap from '@salesforce/apex/TableBuddyService.getRecordTypeIdMap';
import * as tableService from 'c/tableBuddyTableService';
import { generateUUID, reduceErrors } from 'c/tableBuddyMessageService';
import Fuse from 'c/tableBuddyFuse';

// Modal imports
import TableBuddyFlowModal from 'c/tableBuddyFlowModal';
import TableBuddyActionModal from 'c/tableBuddyActionModal';
import TableBuddyEditRowForm from 'c/tableBuddyEditRowForm';
import TableBuddyDeleteRowForm from 'c/tableBuddyDeleteRowForm';

// Merge field data type classifications for type-aware quoting
const DIRECT_MERGE_DATA_TYPES = [
  'anytype',
  'boolean',
  'currency',
  'date',
  'datetime',
  'double',
  'integer',
  'percent',
  'time'
];
const STRING_MERGE_DATA_TYPES = [
  'address',
  'combobox',
  'email',
  'multipicklist',
  'phone',
  'picklist',
  'reference',
  'string',
  'text',
  'textarea',
  'url'
];

// Fuse.js search configuration
const INCLUDE_SCORE = true;
const IGNORE_LOCATION = true;
const SEARCH_THRESHOLD = 0.2;

// Datatable constraints
const MAX_ROW_SELECTION = 200;
const OBJECTS_WITH_COMPOUND_NAMES = ['Contact'];

/* eslint @lwc/lwc/no-api-reassignments: 0 */

export default class TableBuddy extends LightningElement {
  // ---- Public API properties ----
  @api recordId;
  @api objectApiName;
  @api configName;
  @api title;
  @api iconName;

  // Flow outputs
  @api selectedRows = [];
  @api firstSelectedRow = {};

  // ---- Reactive tracked state ----
  tableData = [];
  tableColumns = [];
  draftValues = [];
  saveErrors = {};

  // ---- Private state ----
  _uniqueBoundary;
  _showSpinner = false;
  _configError;
  _parsedConfig;

  // Display settings from config
  _showSearch = false;
  _showRefresh = false;
  _showRecordCount = false;
  _editableFieldsSet = new Set();

  // Checkbox/selection
  _isHideCheckbox = true;
  _isShowRowNumber = false;
  _maxRowSelection = MAX_ROW_SELECTION;

  // Actions from config
  _tableActions = [];
  _overflowActions = [];
  _rowActions = [];

  // Sorting
  _sortedBy;
  _sortedDirection = 'asc';

  // Query building
  _builtQueryString;
  _finalQueryString;
  _hasRecordMerge = false;

  // Merge field support ($CurrentRecord / $record)
  _mergeMap = new Map();
  _contextObjectApiName;
  _objectInfo;
  _objectFieldsMap = new Map();
  _getRecordFields = [];

  // Data table internals
  _objectApiName;
  _originalTableData = [];
  _fuseData;
  _draftValuesMap = new Map();
  _draftSuccessIds = new Set();
  _extractIconName = false;
  _lookupConfigs;

  // ---- Getters ----

  get computedIconName() {
    if (this.iconName && this.iconName.toLowerCase() === 'auto') {
      if (this._objectInfo) {
        return this._extractCardIconNameFromObjectInfo();
      }
      this._extractIconName = true;
    }
    return this.iconName;
  }

  get showRecordCount() {
    return this._showRecordCount;
  }

  get recordCountDisplay() {
    return this.tableData && this.tableData.length
      ? `(${this.tableData.length})`
      : '';
  }

  get containerClass() {
    return [
      'slds-border_top',
      'slds-border_bottom',
      'slds-border_left',
      'slds-border_right',
      'slds-is-relative'
    ].join(' ');
  }

  get extensionBoundaryClass() {
    return `extension-boundary-class-${this._uniqueBoundary}`;
  }

  get _hasTableActions() {
    return this._tableActions && this._tableActions.length > 0;
  }

  get _hasOverflowActions() {
    return this._overflowActions && this._overflowActions.length > 0;
  }

  get messageService() {
    return this.template.querySelector('c-table-buddy-message-service');
  }

  get searchInput() {
    return this.template.querySelector('.search-input');
  }

  // ---- Wire adapters for $CurrentRecord merge ----

  @wire(getObjectInfo, { objectApiName: '$_contextObjectApiName' })
  contextObjectInfoWire({ error, data }) {
    if (error) {
      this._notifySingleError('getObjectInfo error', error);
    } else if (data) {
      this._objectInfo = data;
      this._objectFieldsMap = new Map(Object.entries(data.fields));
      if (this._extractIconName) {
        this.iconName = this._extractCardIconNameFromObjectInfo();
        this._extractIconName = false;
      }
      // Trigger getRecord by populating field list
      if (this._mergeMap.size > 0) {
        this._getRecordFields = Array.from(this._mergeMap.values()).map(
          (config) => config.objectQualifiedFieldApiName
        );
      }
    }
  }

  @wire(getRecord, { recordId: '$recordId', fields: '$_getRecordFields' })
  contextRecordWire({ error, data }) {
    if (error) {
      this._notifySingleError('getRecord error', error);
    } else if (data) {
      for (let config of this._mergeMap.values()) {
        config.value = data.fields[config.fieldApiName].value;
        config.dataType = this._objectInfo.fields[config.fieldApiName].dataType;
      }
      // Merge values into query string with type-aware quoting
      let mergedQuery = this._builtQueryString;
      for (const [key, config] of this._mergeMap.entries()) {
        const dataType = config.dataType.toLowerCase();
        if (DIRECT_MERGE_DATA_TYPES.includes(dataType)) {
          mergedQuery = mergedQuery.replace(key, config.value);
        }
        if (STRING_MERGE_DATA_TYPES.includes(dataType)) {
          mergedQuery = mergedQuery.replace(key, `'${config.value}'`);
        }
      }
      this._finalQueryString = mergedQuery;
      this._validateQueryStringAndInitialize();
    }
  }

  // Second wire for table objectInfo (after data loads, for icon + column cleaning)
  @wire(getObjectInfo, { objectApiName: '$_objectApiName' })
  tableObjectInfoWire({ error, data }) {
    if (error) {
      this._notifySingleError('getObjectInfo error', error);
    } else if (data) {
      this._objectInfo = data;
      this._objectFieldsMap = new Map(Object.entries(data.fields));
      if (this._extractIconName) {
        this.iconName = this._extractCardIconNameFromObjectInfo();
        this._extractIconName = false;
      }
    }
  }

  // ---- Lifecycle ----

  connectedCallback() {
    this._uniqueBoundary = generateUUID();
    if (this.configName) {
      this._loadConfig();
    }
  }

  constructor() {
    super();
    this.template.addEventListener(
      'editablecellrendered',
      this._handleEditableCellRendered
    );
  }

  // ---- Public API methods ----

  @api
  async refreshWithQuery(queryString) {
    this._showSpinner = true;
    this._finalQueryString = this._normalizeQueryKeywords(queryString);
    try {
      const cache = await tableService.fetchTableCache({
        queryString: this._finalQueryString
      });
      if (!this._objectApiName) {
        this._objectApiName = cache.objectApiName;
      }
      this._initializeTable(
        cache.objectApiName,
        cache.tableColumns,
        cache.tableData
      );
    } catch (error) {
      this._notifySingleError('Query Error', error);
      this._showSpinner = false;
    }
  }

  @api
  async refreshTable() {
    this._showSpinner = true;
    try {
      const cache = await tableService.fetchTableCache({
        queryString: this._finalQueryString
      });
      if (!this._objectApiName) {
        this._objectApiName = cache.objectApiName;
      }
      this._initializeTable(
        cache.objectApiName,
        cache.tableColumns,
        cache.tableData
      );
    } catch (error) {
      this._notifySingleError('Refresh Error', error);
      this._showSpinner = false;
    }
  }

  @api
  resetTable() {
    this.selectedRows = [];
    this.firstSelectedRow = {};
    this.tableData = [];
    this.tableColumns = [];
    this.draftValues = [];
    this.saveErrors = {};
    this._sortedBy = undefined;
    this._sortedDirection = 'asc';
    this._builtQueryString = undefined;
    this._finalQueryString = undefined;
    this._mergeMap = new Map();
    this._contextObjectApiName = undefined;
    this._objectApiName = undefined;
    this._objectInfo = undefined;
    this._objectFieldsMap = new Map();
    this._getRecordFields = [];
    this._originalTableData = [];
    this._fuseData = undefined;
    this._draftValuesMap = new Map();
    this._draftSuccessIds = new Set();
  }

  // ---- Config Loading ----

  async _loadConfig() {
    this._showSpinner = true;
    try {
      const config = await getConfigByName({ configName: this.configName });
      if (!config || !config.Config_JSON__c) {
        this._configError = `No configuration found for "${this.configName}".`;
        this._showSpinner = false;
        return;
      }
      this._parsedConfig = JSON.parse(config.Config_JSON__c);
      this._applyConfig();
    } catch (error) {
      this._configError = `Error loading configuration: ${reduceErrors(error).join(', ')}`;
      this._showSpinner = false;
    }
  }

  _applyConfig() {
    const cfg = this._parsedConfig;
    const objectApiName = cfg.objectApiName;
    const fields = cfg.fields || [];
    const querySettings = cfg.querySettings || {};
    const displaySettings = cfg.displaySettings || {};
    const actions = cfg.actions || {};

    // Display settings
    this._showSearch = displaySettings.showSearch === true;
    this._showRefresh = displaySettings.showRefresh === true;
    this._showRecordCount = displaySettings.showRecordCount === true;
    this._editableFieldsSet = new Set(displaySettings.editableFields || []);

    // Checkbox type
    this._applyCheckboxType(displaySettings.checkboxType);

    // Sorting defaults
    if (querySettings.defaultSortField) {
      this._sortedBy = querySettings.defaultSortField.replace('.', '_');
    }
    if (querySettings.defaultSortDirection) {
      this._sortedDirection = querySettings.defaultSortDirection;
    }

    // Actions
    this._tableActions = (actions.tableActions || []).sort(
      (a, b) => a.order - b.order
    );
    this._overflowActions = (actions.overflowActions || []).sort(
      (a, b) => a.order - b.order
    );
    this._rowActions = (actions.rowActions || []).sort(
      (a, b) => a.order - b.order
    );

    // Lookup configs
    this._lookupConfigs = cfg.lookupConfigs;

    // Build SOQL query
    const visibleFields = fields.filter((f) => f.visible !== false);
    const fieldNames = visibleFields.map((f) => f.fieldName);

    // Always include Id
    if (!fieldNames.includes('Id')) {
      fieldNames.unshift('Id');
    }

    let queryString = `SELECT ${fieldNames.join(', ')} FROM ${objectApiName}`;

    if (querySettings.whereClause) {
      queryString += ` WHERE ${querySettings.whereClause}`;
    }
    if (querySettings.limit) {
      queryString += ` LIMIT ${querySettings.limit}`;
    }

    queryString = this._normalizeQueryKeywords(queryString);

    // Handle merge fields
    this._builtQueryString = queryString;
    this._resolveMergeFields(queryString);
  }

  _applyCheckboxType(checkboxType) {
    const type = (checkboxType || 'none').toLowerCase();
    switch (type) {
      case 'multi':
        this._maxRowSelection = MAX_ROW_SELECTION;
        this._isHideCheckbox = false;
        this._isShowRowNumber = true;
        break;
      case 'single':
        this._maxRowSelection = 1;
        this._isHideCheckbox = false;
        this._isShowRowNumber = true;
        break;
      default:
        this._isHideCheckbox = true;
        this._isShowRowNumber = false;
        break;
    }
  }

  // ---- Merge Field Resolution ----

  _resolveMergeFields(queryString) {
    // Replace $recordId
    if (queryString.includes('$recordId')) {
      queryString = queryString.replace(/\$recordId/g, `'${this.recordId}'`);
      this._builtQueryString = queryString;
    }

    // Replace $CurrentUserId
    if (queryString.includes('$CurrentUserId')) {
      queryString = queryString.replace(/\$CurrentUserId/g, `'${Id}'`);
      this._builtQueryString = queryString;
    }

    // Support $record. as shorthand for $CurrentRecord.
    if (
      queryString.includes('$record.') &&
      !queryString.includes('$CurrentRecord.')
    ) {
      queryString = queryString.replace(/\$record\./g, '$CurrentRecord.');
      this._builtQueryString = queryString;
      this._hasRecordMerge = true;
    }

    // Handle $CurrentRecord merge fields via wire chain
    if (this._hasRecordMerge || queryString.includes('$CurrentRecord')) {
      if (!this.objectApiName) {
        this._notifyError(
          'Missing objectApiName',
          '$CurrentRecord can only be used on a Record Page.'
        );
        this._showSpinner = false;
        return;
      }
      const matches = queryString.match(/(\$[\w.]*)/g);
      if (matches) {
        matches.forEach((original) => {
          const config = {
            objectQualifiedFieldApiName: original.replace(
              '$CurrentRecord',
              this.objectApiName
            ),
            fieldApiName: original.replace('$CurrentRecord.', ''),
            value: null
          };
          this._mergeMap.set(original, config);
        });
      }
      // Trigger wire chain: getObjectInfo -> getRecord -> merge -> validate -> execute
      this._contextObjectApiName = this.objectApiName;
      return;
    }

    // No merge fields required; validate and execute immediately
    this._finalQueryString = queryString;
    this._validateQueryStringAndInitialize();
  }

  // ---- Query Validation & Initialization ----

  async _validateQueryStringAndInitialize() {
    try {
      const queryError = await tableService.checkQueryException(
        this._finalQueryString
      );
      if (queryError) {
        this._notifyError('Invalid Query String', queryError);
        this._showSpinner = false;
        return;
      }
      await this.refreshTable();
    } catch (error) {
      this._notifySingleError('Query Validation Error', error);
      this._showSpinner = false;
    }
  }

  // ---- Table Initialization ----

  _initializeTable(objectApiName, columns, data) {
    this._showSpinner = true;

    // Set table objectApiName (triggers objectInfo wire for icon/column cleaning)
    if (!this._objectApiName || this._objectApiName !== objectApiName) {
      this._objectApiName = objectApiName;
    }

    this._setTableColumns(columns);
    this._setTableData(data);
    this._clearDraftValuesOnSuccess();

    if (this._showSearch) {
      this._prepGlobalSearch();
    }

    // Publish lookup configs via LMS
    if (this._lookupConfigs && this.messageService) {
      this.messageService.publish({
        key: 'lookupconfigload',
        value: { lookupConfigs: this._lookupConfigs }
      });
    }

    this._showSpinner = false;
  }

  // ---- Column Processing ----

  _setTableColumns(tableColumns) {
    if (!tableColumns || !tableColumns.length) {
      return;
    }
    const finalColumns = [];
    const configFields = this._parsedConfig ? this._parsedConfig.fields : [];
    const fieldConfigMap = new Map(
      configFields.map((f) => [f.fieldName.replace('.', '_'), f])
    );

    for (let col of tableColumns) {
      // Skip auto-queried RecordTypeId
      if (col.fieldName.toLowerCase() === 'recordtypeid') {
        continue;
      }

      const fieldConfig = fieldConfigMap.get(col.fieldName);

      // Apply label override from config
      if (fieldConfig && fieldConfig.label) {
        col.label = fieldConfig.label;
      }

      // Apply sortable from config
      if (fieldConfig && fieldConfig.sortable === true) {
        col.sortable = true;
      }

      // Apply editable from displaySettings.editableFields
      if (this._editableFieldsSet.size > 0) {
        col.editable = this._editableFieldsSet.has(col.fieldName);
      }

      // Custom type typeAttributes injection
      if (col.type.startsWith('custom')) {
        const additional = {
          tableBoundary: this._uniqueBoundary,
          rowKeyAttribute: 'Id',
          rowKeyValue: { fieldName: 'Id' },
          isEditable: this._editableFieldsSet.has(col.fieldName),
          objectApiName: col.typeAttributes
            ? col.typeAttributes.objectApiName
            : this._objectApiName,
          columnName: col.typeAttributes
            ? col.typeAttributes.columnName
            : col.fieldName,
          fieldApiName: col.typeAttributes
            ? col.typeAttributes.fieldApiName
            : col.fieldName
        };
        col.typeAttributes = { ...col.typeAttributes, ...additional };
      }

      // Contact compound name
      if (col.type === 'customName') {
        if (OBJECTS_WITH_COMPOUND_NAMES.includes(this._objectApiName)) {
          col.typeAttributes.isCompoundName = true;
        }
      }

      // Apply typeAttributesOverride from config
      if (fieldConfig && fieldConfig.typeAttributesOverride) {
        col.typeAttributes = {
          ...col.typeAttributes,
          ...fieldConfig.typeAttributesOverride
        };
      }

      // Apply width from config
      if (fieldConfig && fieldConfig.width) {
        col.initialWidth = fieldConfig.width;
      }

      finalColumns.push(col);
    }

    // Add row action column if configured
    if (this._rowActions.length > 0) {
      finalColumns.push({
        type: 'action',
        typeAttributes: {
          rowActions: this._getRowActions.bind(this),
          menuAlignment: 'auto'
        }
      });
    }

    this.tableColumns = finalColumns;
  }

  // ---- Data Processing ----

  _setTableData(tableData) {
    if (!tableData || !tableData.length) {
      this.tableData = [];
      this._originalTableData = [];
      return;
    }
    if (this._sortedBy) {
      this._sortData(this._sortedBy, this._sortedDirection, tableData);
    } else {
      this.tableData = tableData;
    }
    this._originalTableData = this.tableData;
  }

  // ---- Sorting ----

  handleColumnSorting(event) {
    this._sortedBy = event.detail.fieldName;
    this._sortedDirection = event.detail.sortDirection;
    this._sortData(this._sortedBy, this._sortedDirection, this.tableData);
  }

  _sortData(fieldName, sortDirection, unsortedData) {
    const dataToSort = JSON.parse(JSON.stringify(unsortedData));
    const reverse = sortDirection !== 'asc';
    this.tableData = dataToSort.sort(this._sortBy(fieldName, reverse));
  }

  _sortBy(field, reverse) {
    const key = function (x) {
      return x[field];
    };
    const direction = !reverse ? 1 : -1;
    return function (a, b) {
      const aVal = key(a) ? key(a) : '';
      const bVal = key(b) ? key(b) : '';
      return direction * ((aVal > bVal) - (bVal > aVal));
    };
  }

  // ---- Fuse.js Global Search ----

  handleSearch(event) {
    if (!this.tableData || !this._fuseData) {
      return;
    }
    const searchText = event.detail.value;
    window.clearTimeout(this._delaySearch);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._delaySearch = setTimeout(() => {
      if (!searchText) {
        this.tableData = this._originalTableData;
        return;
      }
      if (searchText.length >= 2) {
        const results = this._fuseData.search(searchText);
        const indexHits = results
          .filter((obj) => obj.score <= SEARCH_THRESHOLD)
          .map((obj) => obj.refIndex);
        this.tableData = this._originalTableData.filter((row, index) =>
          indexHits.includes(index)
        );
      }
    }, 350);
  }

  _prepGlobalSearch() {
    if (!this._originalTableData.length) {
      return;
    }
    if (this.searchInput) {
      this.searchInput.value = null;
    }
    const firstRow = this._originalTableData[0];
    const searchKeys = Object.keys(firstRow).filter(
      (fieldName) =>
        typeof firstRow[fieldName] !== 'object' &&
        !fieldName.toLowerCase().includes('id')
    );
    const options = {
      includeScore: INCLUDE_SCORE,
      ignoreLocation: IGNORE_LOCATION,
      threshold: SEARCH_THRESHOLD,
      keys: searchKeys
    };
    this._fuseData = new Fuse(this._originalTableData, options);
  }

  // ---- Inline Editing ----

  handleCellChange(event) {
    event.stopPropagation();
    event.detail.draftValues.forEach((draft) => {
      if (!this._draftValuesMap.has(draft.Id)) {
        this._draftValuesMap.set(draft.Id, draft);
      }
      const changedData = this._draftValuesMap.get(draft.Id);
      this._draftValuesMap.set(draft.Id, { ...changedData, ...draft });
    });
    if (this._draftValuesMap.size > 0) {
      this.draftValues = [...this._draftValuesMap.values()];
    }
  }

  handleCancel() {
    this._clearDraftValues([...this._draftValuesMap.keys()]);
    if (this.messageService) {
      this.messageService.publish({ key: 'canceldraft' });
    }
  }

  async handleSave() {
    const rowKeyToRowNumberMap = new Map(
      this.draftValues.map((draft) => [
        draft.Id,
        this.tableData.findIndex((data) => draft.Id === data.Id) + 1
      ])
    );

    this._showSpinner = true;
    const saveResults = await tableService.updateDraftValues(
      this.draftValues,
      rowKeyToRowNumberMap
    );

    if (
      saveResults.errors &&
      saveResults.errors.rows &&
      Object.keys(saveResults.errors.rows).length
    ) {
      this.saveErrors = saveResults.errors;
    }
    if (saveResults.success && saveResults.success.length) {
      const cleanRowKey = 'id'; // LDS response lowercases 'Id'
      saveResults.success.forEach((recordInput) => {
        this._draftSuccessIds.add(recordInput[cleanRowKey]);
      });
      await this.refreshTable();
    }
    this._showSpinner = false;
  }

  _clearDraftValues(rowKeysToNull) {
    this.draftValues = this.draftValues.filter(
      (draft) => !rowKeysToNull.includes(draft.Id)
    );
    rowKeysToNull.forEach((key) => {
      this._draftValuesMap.delete(key);
    });
    if (this.messageService) {
      this.messageService.publish({
        key: 'setdraftvalue',
        value: { rowKeysToNull: rowKeysToNull }
      });
    }
    if (this._draftValuesMap.size === 0 && this.draftValues.length === 0) {
      this.saveErrors = [];
      this._draftSuccessIds = new Set();
    }
  }

  _clearDraftValuesOnSuccess() {
    if (this._draftSuccessIds.size) {
      this._clearDraftValues([...this._draftSuccessIds.keys()]);
    }
  }

  // ---- Row Selection ----

  handleRowSelection(event) {
    if (event.detail.selectedRows && event.detail.selectedRows.length) {
      this.selectedRows = event.detail.selectedRows.map((row) =>
        this._getCleanRow(row)
      );
      this.firstSelectedRow = this._getCleanRow(event.detail.selectedRows[0]);
      this.dispatchEvent(
        new FlowAttributeChangeEvent('selectedRows', this.selectedRows)
      );
      this.dispatchEvent(
        new FlowAttributeChangeEvent('firstSelectedRow', this.firstSelectedRow)
      );
    }
    // Publish for mass inline editing support
    if (this.messageService) {
      this.messageService.publish({
        key: 'rowselected',
        value: { selectedRows: event.detail.selectedRows }
      });
    }
  }

  // ---- Row Actions ----

  _getRowActions(row, doneCallback) {
    const actions = [];
    this._rowActions.forEach((cfg) => {
      if (cfg.type === 'builtin' && cfg.name === 'edit_row') {
        if (this._objectInfo && this._objectInfo.updateable) {
          actions.push({ label: cfg.label, name: 'edit_row' });
        }
      } else if (cfg.type === 'builtin' && cfg.name === 'delete_row') {
        if (this._objectInfo && this._objectInfo.deletable) {
          actions.push({ label: cfg.label, name: 'delete_row' });
        }
      } else if (cfg.type === 'flow') {
        actions.push({
          label: cfg.label,
          name: 'custom_flow',
          flowApiName: cfg.flowApiName,
          dialogSize: cfg.dialogSize
        });
      } else if (cfg.type === 'lwc') {
        actions.push({
          label: cfg.label,
          name: 'custom_lwc',
          lwcName: cfg.lwcName,
          dialogSize: cfg.dialogSize
        });
      }
    });
    doneCallback(actions);
  }

  async handleRowAction(event) {
    const action = event.detail.action;
    const row = event.detail.row;

    switch (action.name) {
      case 'edit_row': {
        const editableFields = this._editableFieldsSet.size
          ? [...this._editableFieldsSet]
          : [];
        const result = await TableBuddyEditRowForm.open({
          size: 'large',
          recordId: row.Id,
          objectApiName: this._objectApiName,
          editableFields: editableFields,
          modalHeader: `Edit ${this._objectInfo ? this._objectInfo.label : ''} Record`
        });
        if (result && result.status === 'saved') {
          await this.refreshTable();
        }
        break;
      }
      case 'delete_row': {
        const recordName = row.Name || row.CaseNumber || row.Id;
        const result = await TableBuddyDeleteRowForm.open({
          size: 'small',
          recordId: row.Id,
          recordName: recordName,
          modalHeader: `Delete ${this._objectInfo ? this._objectInfo.label : ''}`
        });
        if (result && result.status === 'deleted') {
          await this.refreshTable();
        }
        break;
      }
      case 'custom_flow': {
        await this._openFlowModal(action.flowApiName, action.dialogSize, row);
        break;
      }
      case 'custom_lwc': {
        await this._openLwcModal(
          action.lwcName,
          action.label,
          action.dialogSize,
          row
        );
        break;
      }
      default:
        break;
    }
  }

  // ---- Table Actions ----

  async handleTableAction(event) {
    const index = parseInt(event.target.dataset.actionIndex, 10);
    const action = this._tableActions.find((a) => a.order === index);
    if (!action) {
      return;
    }
    if (action.type === 'flow') {
      await this._openFlowModal(action.flowApiName, action.dialogSize);
    } else if (action.type === 'lwc') {
      await this._openLwcModal(action.lwcName, action.label, action.dialogSize);
    }
  }

  // ---- Overflow Actions ----

  async handleOverflowAction(event) {
    const index = parseInt(event.target.dataset.actionIndex, 10);
    const action = this._overflowActions.find((a) => a.order === index);
    if (!action) {
      return;
    }
    if (action.type === 'flow') {
      await this._openFlowModal(action.flowApiName, action.dialogSize);
    } else if (action.type === 'lwc') {
      await this._openLwcModal(action.lwcName, action.label, action.dialogSize);
    }
  }

  // ---- Modal Helpers ----

  async _openFlowModal(flowApiName, dialogSize, row) {
    const inputVariables = [];
    const selectedRows = row
      ? [this._getCleanRow({ ...row })]
      : this.selectedRows.map((r) => this._getCleanRow({ ...r }));

    if (selectedRows.length) {
      inputVariables.push({
        name: 'SelectedRows',
        type: 'SObject',
        value: selectedRows
      });
      inputVariables.push({
        name: 'FirstSelectedRow',
        type: 'SObject',
        value: selectedRows[0]
      });
    }
    if (this._uniqueBoundary) {
      inputVariables.push({
        name: 'UniqueBoundary',
        type: 'String',
        value: this._uniqueBoundary
      });
    }
    if (this.recordId) {
      inputVariables.push({
        name: 'SourceRecordId',
        type: 'String',
        value: this.recordId
      });
    }

    const size = this._normalizeModalSize(dialogSize);
    const result = await TableBuddyFlowModal.open({
      size: size,
      flowApiName: flowApiName,
      inputVariables: inputVariables,
      modalHeader: flowApiName
    });
    if (result && result.status === 'finished') {
      await this.refreshTable();
    }
  }

  async _openLwcModal(lwcName, headerLabel, dialogSize, row) {
    const selectedRows = row
      ? [this._getCleanRow({ ...row })]
      : this.selectedRows.map((r) => this._getCleanRow({ ...r }));

    const size = this._normalizeModalSize(dialogSize);
    const result = await TableBuddyActionModal.open({
      size: size,
      lwcName: lwcName,
      modalHeader: headerLabel || lwcName,
      actionPayload: {
        uniqueBoundary: this._uniqueBoundary,
        selectedRows: selectedRows,
        sourceRecordId: this.recordId
      }
    });
    if (result && result.status === 'completed') {
      await this.refreshTable();
    }
  }

  _normalizeModalSize(dialogSize) {
    if (!dialogSize) {
      return 'medium';
    }
    const sizeMap = {
      small: 'small',
      medium: 'medium',
      large: 'large'
    };
    return sizeMap[dialogSize.toLowerCase()] || 'medium';
  }

  // ---- Refresh / Message Handlers ----

  handleRefresh() {
    this.refreshTable();
  }

  handleMessageRefresh() {
    this.refreshTable();
  }

  // ---- RecordType support for editable picklist cells ----

  _handleEditableCellRendered = () => {
    window.clearTimeout(this._delayEditableCellRendered);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._delayEditableCellRendered = setTimeout(() => {
      this._initializeLookupConfigData();
      this._initializeRecordTypeIdData();
    }, 500);
  };

  _initializeLookupConfigData() {
    if (this._lookupConfigs && this.messageService) {
      this.messageService.publish({
        key: 'lookupconfigload',
        value: { lookupConfigs: this._lookupConfigs }
      });
    }
  }

  _initializeRecordTypeIdData() {
    // Collect record Ids from tableData for RecordType mapping
    if (!this.tableData || !this.tableData.length || !this.messageService) {
      return;
    }
    const recordIds = this.tableData
      .filter((row) => row.Id)
      .map((row) => row.Id);
    if (recordIds.length === 0) {
      return;
    }
    getRecordTypeIdMap({ recordIds: recordIds })
      .then((rtMap) => {
        if (rtMap && Object.keys(rtMap).length > 0) {
          this.messageService.publish({
            key: 'picklistconfigload',
            value: { recordTypeIdMap: rtMap }
          });
        }
      })
      .catch((error) => {
        console.error('getRecordTypeIdMap error:', error);
      });
  }

  // ---- Utility Methods ----

  _getCleanRow(row) {
    const cleanRow = { ...row };
    for (let fieldName in cleanRow) {
      if (typeof cleanRow[fieldName] === 'object') {
        continue;
      }
      if (
        this._objectFieldsMap.size > 0 &&
        !this._objectFieldsMap.has(fieldName)
      ) {
        delete cleanRow[fieldName];
      }
    }
    return cleanRow;
  }

  _extractCardIconNameFromObjectInfo() {
    let extractedIconName;
    if (
      this._objectInfo &&
      this._objectInfo.themeInfo &&
      this._objectInfo.themeInfo.iconUrl
    ) {
      const iconUrlFragments = this._objectInfo.themeInfo.iconUrl.split('/');
      const iconType = iconUrlFragments[iconUrlFragments.length - 2];
      const icon = iconUrlFragments[iconUrlFragments.length - 1].replace(
        '_120.png',
        ''
      );
      extractedIconName = `${iconType}:${icon}`;
    }
    return extractedIconName;
  }

  _normalizeQueryKeywords(queryString) {
    if (!queryString) {
      return queryString;
    }
    return queryString
      .replace(new RegExp('select ', 'ig'), 'SELECT ')
      .replace(new RegExp(' from ', 'ig'), ' FROM ')
      .replace(new RegExp(' where ', 'ig'), ' WHERE ')
      .replace(new RegExp(' limit ', 'ig'), ' LIMIT ');
  }

  // ---- Toast Helpers ----

  _notifySingleError(title, error = '') {
    if (this.messageService) {
      this.messageService.notifySingleError(title, error);
    } else {
      this._notifyError(title, reduceErrors(error)[0]);
    }
  }

  _notifyError(title, error = '') {
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: error,
        variant: 'error',
        mode: 'sticky'
      })
    );
  }
}
