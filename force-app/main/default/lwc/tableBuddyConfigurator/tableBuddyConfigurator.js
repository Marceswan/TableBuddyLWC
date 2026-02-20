import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import getConfigs from '@salesforce/apex/TableBuddyService.getConfigs';
import saveConfig from '@salesforce/apex/TableBuddyService.saveConfig';
import deleteConfig from '@salesforce/apex/TableBuddyService.deleteConfig';
import getObjectFields from '@salesforce/apex/TableBuddyService.getObjectFields';
import getSearchableObjects from '@salesforce/apex/TableBuddyService.getSearchableObjects';
import getRecordFieldValues from '@salesforce/apex/TableBuddyService.getRecordFieldValues';

export default class TableBuddyConfigurator extends LightningElement {
  // ---- Config Management ----
  configName = '';
  configDescription = '';
  selectedConfigId = '';
  configOptions = [];

  // ---- Object Selection ----
  selectedObject = '';
  objectSearchTerm = '';
  @track objectSearchResults = [];
  showObjectDropdown = false;

  // ---- Fields ----
  @track fields = [];
  fieldSearchTerm = '';
  fieldVisibilityFilter = 'all';

  // ---- Actions ----
  @track tableActions = [];
  @track overflowActions = [];
  @track rowActions = [];

  // ---- Lookup Configs ----
  @track lookupConfigs = {};

  // ---- Query Settings ----
  whereClause = '';
  rowLimit = 500;
  defaultSortField = '';
  defaultSortDirection = 'asc';

  // ---- Display Settings ----
  checkboxType = 'None';
  showRecordCount = false;
  showSearch = false;
  showRefresh = false;

  // ---- Context Record ----
  contextObjectApiName = '';
  contextObjectLabel = '';
  contextObjectSearchTerm = '';
  contextRecordId = '';
  @track contextObjectResults = [];
  showContextObjectDropdown = false;

  // ---- Preview ----
  _previewKey = 0;

  // ---- Internal State ----
  isLoading = false;
  showDeleteModal = false;
  _configsMap = new Map();
  _dragFieldName;
  _objectBlurTimeout;
  _contextBlurTimeout;
  _contextFieldValues = {};
  _mergeTokens = [];
  _expandedFieldName = null;

  // ===================== GETTERS =====================

  get hasFields() {
    return this.fields.length > 0;
  }

  get fieldVisibilityFilterOptions() {
    return [
      { label: 'All Fields', value: 'all' },
      { label: 'Selected Only', value: 'selected' },
      { label: 'Unselected Only', value: 'unselected' }
    ];
  }

  get filteredFields() {
    let result = this.fields;
    if (this.fieldSearchTerm) {
      const term = this.fieldSearchTerm.toLowerCase();
      result = result.filter(
        (f) =>
          f.fieldName.toLowerCase().includes(term) ||
          f.label.toLowerCase().includes(term)
      );
    }
    if (this.fieldVisibilityFilter === 'selected') {
      result = result.filter((f) => f.visible);
    } else if (this.fieldVisibilityFilter === 'unselected') {
      result = result.filter((f) => !f.visible);
    }
    return result.map((f) => ({
      ...f,
      _isExpanded: this._expandedFieldName === f.fieldName,
      _expandedKey: f.fieldName + '_advanced'
    }));
  }

  get isSaveDisabled() {
    return !this.configName;
  }

  get isDeleteDisabled() {
    return !this.selectedConfigId;
  }

  get isCloneDisabled() {
    return !this.selectedConfigId;
  }

  get fieldCount() {
    return this.fields.length;
  }

  get editableFieldsList() {
    return this.fields
      .filter((f) => f.visible && f.editable)
      .map((f) => f.fieldName)
      .join(', ');
  }

  get referenceFields() {
    return this.fields.filter((f) => f.visible && f.referenceTo);
  }

  get hasReferenceFields() {
    return this.referenceFields.length > 0;
  }

  get lookupConfigEntries() {
    const entries = [];
    const allConfig = this.lookupConfigs.All || {
      titleField: 'Name',
      subtitleField: '',
      iconName: ''
    };
    entries.push({ objectName: 'All', ...allConfig, isDefault: true });
    const refObjects = [
      ...new Set(this.referenceFields.map((f) => f.referenceTo).filter(Boolean))
    ];
    for (const obj of refObjects) {
      const config = this.lookupConfigs[obj] || {
        titleField: '',
        subtitleField: '',
        iconName: ''
      };
      entries.push({ objectName: obj, ...config, isDefault: false });
    }
    return entries;
  }

  get previewQueryString() {
    const visibleFields = this.fields.filter((f) => f.visible);
    if (!this.selectedObject || visibleFields.length === 0) {
      return '';
    }
    const fieldNames = visibleFields.map((f) => f.fieldName);
    if (!fieldNames.includes('Id')) {
      fieldNames.unshift('Id');
    }
    let query = `SELECT ${fieldNames.join(', ')} FROM ${this.selectedObject}`;
    if (this.whereClause) {
      query += ` WHERE ${this.whereClause}`;
    }
    query += ` LIMIT ${this.rowLimit || 500}`;
    return query;
  }

  get resolvedPreviewQueryString() {
    const raw = this.previewQueryString;
    if (!raw) {
      return '';
    }
    if (this._mergeTokens.length === 0) {
      return raw;
    }
    if (!this.contextRecordId) {
      return '';
    }
    if (Object.keys(this._contextFieldValues).length === 0) {
      return '';
    }
    let resolved = raw;
    for (const fieldName of this._mergeTokens) {
      const value = this._contextFieldValues[fieldName];
      const token = `$record.${fieldName}`;
      if (value === null || value === undefined) {
        resolved = resolved.split(token).join('NULL');
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        resolved = resolved.split(token).join(String(value));
      } else {
        resolved = resolved.split(token).join(`'${String(value)}'`);
      }
    }
    return resolved;
  }

  get mergeTokenCount() {
    return this._mergeTokens.length;
  }

  get mergeTokenStatusText() {
    if (this._mergeTokens.length === 0) {
      return '';
    }
    if (!this.contextRecordId) {
      return `${this._mergeTokens.length} $record token(s) detected - select a context record to resolve`;
    }
    if (Object.keys(this._contextFieldValues).length > 0) {
      return `${this._mergeTokens.length} token(s) resolved`;
    }
    return `Fetching ${this._mergeTokens.length} field value(s)...`;
  }

  get hasPendingMergeTokens() {
    return this._mergeTokens.length > 0 && !this.contextRecordId;
  }

  get contextObjectNoResults() {
    return (
      this.contextObjectResults.length === 0 &&
      this.contextObjectSearchTerm.length > 0
    );
  }

  get objectNoResults() {
    return (
      this.objectSearchResults.length === 0 && this.objectSearchTerm.length > 0
    );
  }

  get sortableFieldOptions() {
    const options = [{ label: '-- None --', value: '' }];
    for (const f of this.fields) {
      if (f.visible && f.sortable) {
        options.push({
          label: `${f.label} (${f.fieldName})`,
          value: f.fieldName
        });
      }
    }
    return options;
  }

  get sortDirectionOptions() {
    return [
      { label: 'Ascending', value: 'asc' },
      { label: 'Descending', value: 'desc' }
    ];
  }

  get isDefaultSortDirectionDisabled() {
    return !this.defaultSortField;
  }

  get checkboxTypeOptions() {
    return [
      { label: 'None', value: 'None' },
      { label: 'Multi-Select', value: 'Multi' },
      { label: 'Single-Select', value: 'Single' }
    ];
  }

  get actionTypeOptions() {
    return [
      { label: 'Flow', value: 'flow' },
      { label: 'LWC', value: 'lwc' }
    ];
  }

  get rowActionTypeOptions() {
    return [
      { label: 'Built-in', value: 'builtin' },
      { label: 'Flow', value: 'flow' },
      { label: 'LWC', value: 'lwc' }
    ];
  }

  get dialogSizeOptions() {
    return [
      { label: 'Small', value: 'Small' },
      { label: 'Medium', value: 'Medium' },
      { label: 'Large', value: 'Large' }
    ];
  }

  get hasTableActions() {
    return this.tableActions.length > 0;
  }

  get hasOverflowActions() {
    return this.overflowActions.length > 0;
  }

  get hasRowActions() {
    return this.rowActions.length > 0;
  }

  get hasEditRowAction() {
    return this.rowActions.some((a) => a.name === 'edit_row');
  }

  get hasDeleteRowAction() {
    return this.rowActions.some((a) => a.name === 'delete_row');
  }

  // ===================== LIFECYCLE =====================

  async connectedCallback() {
    await this._loadConfigs();
  }

  renderedCallback() {
    this._refreshPreviewIfNeeded();
  }

  // ===================== CONFIG MANAGEMENT =====================

  async handleConfigSelect(event) {
    const configId = event.detail.value;
    if (!configId) {
      this.handleNew();
      return;
    }
    const config = this._configsMap.get(configId);
    if (!config) {
      return;
    }
    this.selectedConfigId = configId;
    this.configName = config.Name;
    this.configDescription = config.Description__c || '';
    try {
      const parsed = JSON.parse(config.Config_JSON__c);
      await this._restoreConfig(parsed);
    } catch (e) {
      this._showToast(
        'Error',
        'Failed to parse config JSON: ' + e.message,
        'error'
      );
    }
  }

  handleNew() {
    this.selectedConfigId = '';
    this.configName = '';
    this.configDescription = '';
    this.selectedObject = '';
    this.objectSearchTerm = '';
    this.objectSearchResults = [];
    this.showObjectDropdown = false;
    this.whereClause = '';
    this.rowLimit = 500;
    this.fields = [];
    this.fieldSearchTerm = '';
    this.fieldVisibilityFilter = 'all';
    this.defaultSortField = '';
    this.defaultSortDirection = 'asc';
    this.showRecordCount = false;
    this.showSearch = false;
    this.showRefresh = false;
    this.checkboxType = 'None';
    this.tableActions = [];
    this.overflowActions = [];
    this.rowActions = [];
    this.lookupConfigs = {};
    this.contextObjectApiName = '';
    this.contextObjectLabel = '';
    this.contextObjectSearchTerm = '';
    this.contextRecordId = '';
    this.contextObjectResults = [];
    this.showContextObjectDropdown = false;
    this._contextFieldValues = {};
    this._mergeTokens = [];
    this._expandedFieldName = null;
    this._previewKey++;
  }

  handleClone() {
    this.selectedConfigId = '';
    this.configName = this.configName + ' - Copy';
    this._showToast(
      'Cloned',
      'Config cloned - update the name and click Save to create a new copy.',
      'info'
    );
  }

  handleNameChange(event) {
    this.configName = event.detail.value;
  }

  handleDescriptionChange(event) {
    this.configDescription = event.detail.value;
  }

  // ===================== OBJECT SEARCH =====================

  async handleObjectSearch(event) {
    this.objectSearchTerm = event.detail.value;
    if (
      this.selectedObject &&
      this.objectSearchTerm !==
        `${this._getObjectLabel(this.selectedObject)} (${this.selectedObject})`
    ) {
      this.selectedObject = '';
      this.fields = [];
      this._expandedFieldName = null;
    }
    if (this.objectSearchTerm.length < 2) {
      this.objectSearchResults = [];
      this.showObjectDropdown = false;
      return;
    }
    try {
      const results = await getSearchableObjects({
        searchTerm: this.objectSearchTerm
      });
      this.objectSearchResults = results;
      this.showObjectDropdown = true;
    } catch (err) {
      // Silently handle search errors
      this.objectSearchResults = [];
      this.showObjectDropdown = false;

      console.debug('Object search error:', err);
    }
  }

  handleObjectKeyUp(event) {
    if (event.key === 'Escape') {
      this.showObjectDropdown = false;
    }
  }

  handleObjectFocus() {
    if (this.objectSearchResults.length > 0 && !this.selectedObject) {
      this.showObjectDropdown = true;
    }
  }

  handleObjectBlur() {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._objectBlurTimeout = setTimeout(() => {
      this.showObjectDropdown = false;
    }, 200);
  }

  async handleObjectSelect(event) {
    if (this._objectBlurTimeout) {
      clearTimeout(this._objectBlurTimeout);
    }
    const apiName = event.currentTarget.dataset.apiName;
    const label = event.currentTarget.dataset.label;
    this.selectedObject = apiName;
    this.objectSearchTerm = `${label} (${apiName})`;
    this.showObjectDropdown = false;
    this.objectSearchResults = [];
    this._expandedFieldName = null;
    await this._loadFieldsForObject(apiName);
  }

  handleObjectClear() {
    this.selectedObject = '';
    this.objectSearchTerm = '';
    this.fields = [];
    this.objectSearchResults = [];
    this.showObjectDropdown = false;
    this._expandedFieldName = null;
    this._previewKey++;
  }

  // ===================== FIELD HANDLERS =====================

  handleFieldSearchChange(event) {
    this.fieldSearchTerm = event.detail.value;
  }

  handleFieldVisibilityFilterChange(event) {
    this.fieldVisibilityFilter = event.detail.value;
  }

  handleSelectAll() {
    this.fields = this.fields.map((f) => ({ ...f, visible: true }));
  }

  handleDeselectAll() {
    this.fields = this.fields.map((f) => ({ ...f, visible: false }));
  }

  handleFieldVisibleChange(event) {
    const fieldName = event.target.dataset.fieldName;
    this.fields = this.fields.map((f) => {
      if (f.fieldName === fieldName) {
        return { ...f, visible: event.target.checked };
      }
      return f;
    });
  }

  handleFieldLabelChange(event) {
    const fieldName = event.target.dataset.fieldName;
    const newLabel = event.detail.value;
    this.fields = this.fields.map((f) => {
      if (f.fieldName === fieldName) {
        return { ...f, label: newLabel };
      }
      return f;
    });
  }

  handleFieldSortableChange(event) {
    const fieldName = event.target.dataset.fieldName;
    this.fields = this.fields.map((f) => {
      if (f.fieldName === fieldName) {
        return { ...f, sortable: event.target.checked };
      }
      return f;
    });
    if (!event.target.checked && this.defaultSortField === fieldName) {
      this.defaultSortField = '';
    }
  }

  handleFieldEditableChange(event) {
    const fieldName = event.target.dataset.fieldName;
    this.fields = this.fields.map((f) => {
      if (f.fieldName === fieldName) {
        return { ...f, editable: event.target.checked };
      }
      return f;
    });
  }

  handleToggleFieldAdvanced(event) {
    const fieldName = event.currentTarget.dataset.fieldName;
    this._expandedFieldName =
      this._expandedFieldName === fieldName ? null : fieldName;
  }

  isFieldExpanded(fieldName) {
    return this._expandedFieldName === fieldName;
  }

  handleFieldWidthChange(event) {
    const fieldName = event.target.dataset.fieldName;
    const width = event.detail.value ? parseInt(event.detail.value, 10) : null;
    this.fields = this._updateField(fieldName, { width });
  }

  handleFieldTypeAttrOverrideChange(event) {
    const fieldName = event.target.dataset.fieldName;
    this.fields = this._updateField(fieldName, {
      typeAttributesOverride: event.detail.value || null
    });
  }

  // ===================== DRAG AND DROP =====================

  handleDragStart(event) {
    this._dragFieldName = event.currentTarget.dataset.fieldName;
    event.currentTarget.classList.add('field-row-dragging');
    event.dataTransfer.effectAllowed = 'move';
  }

  handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const row = event.target.closest('tr[data-field-name]');
    this.template
      .querySelectorAll('.field-row-drop-above, .field-row-drop-below')
      .forEach((el) => {
        el.classList.remove('field-row-drop-above', 'field-row-drop-below');
      });
    if (row && row.dataset.fieldName !== this._dragFieldName) {
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (event.clientY < midY) {
        row.classList.add('field-row-drop-above');
      } else {
        row.classList.add('field-row-drop-below');
      }
    }
  }

  handleDrop(event) {
    event.preventDefault();
    const targetRow = event.target.closest('tr[data-field-name]');
    if (!targetRow || !this._dragFieldName) return;
    const targetFieldName = targetRow.dataset.fieldName;
    if (targetFieldName === this._dragFieldName) return;

    const fromIdx = this.fields.findIndex(
      (f) => f.fieldName === this._dragFieldName
    );
    const toIdx = this.fields.findIndex((f) => f.fieldName === targetFieldName);
    if (fromIdx < 0 || toIdx < 0) return;

    const rect = targetRow.getBoundingClientRect();
    const dropAbove = event.clientY < rect.top + rect.height / 2;

    const updated = [...this.fields];
    const [moved] = updated.splice(fromIdx, 1);
    let insertIdx = updated.findIndex((f) => f.fieldName === targetFieldName);
    if (!dropAbove) {
      insertIdx += 1;
    }
    updated.splice(insertIdx, 0, moved);
    this.fields = updated;
    this._dragFieldName = null;
  }

  handleDragEnd() {
    this._dragFieldName = null;
    this.template
      .querySelectorAll(
        '.field-row-dragging, .field-row-drop-above, .field-row-drop-below'
      )
      .forEach((el) => {
        el.classList.remove(
          'field-row-dragging',
          'field-row-drop-above',
          'field-row-drop-below'
        );
      });
  }

  // ===================== LOOKUP CONFIG HANDLERS =====================

  handleLookupTitleFieldChange(event) {
    const objectName = event.target.dataset.objectName;
    const updatedConfigs = { ...this.lookupConfigs };
    if (!updatedConfigs[objectName]) {
      updatedConfigs[objectName] = {
        titleField: '',
        subtitleField: '',
        iconName: ''
      };
    }
    updatedConfigs[objectName] = {
      ...updatedConfigs[objectName],
      titleField: event.detail.value
    };
    this.lookupConfigs = updatedConfigs;
  }

  handleLookupSubtitleFieldChange(event) {
    const objectName = event.target.dataset.objectName;
    const updatedConfigs = { ...this.lookupConfigs };
    if (!updatedConfigs[objectName]) {
      updatedConfigs[objectName] = {
        titleField: '',
        subtitleField: '',
        iconName: ''
      };
    }
    updatedConfigs[objectName] = {
      ...updatedConfigs[objectName],
      subtitleField: event.detail.value
    };
    this.lookupConfigs = updatedConfigs;
  }

  handleLookupIconNameChange(event) {
    const objectName = event.target.dataset.objectName;
    const updatedConfigs = { ...this.lookupConfigs };
    if (!updatedConfigs[objectName]) {
      updatedConfigs[objectName] = {
        titleField: '',
        subtitleField: '',
        iconName: ''
      };
    }
    updatedConfigs[objectName] = {
      ...updatedConfigs[objectName],
      iconName: event.detail.value
    };
    this.lookupConfigs = updatedConfigs;
  }

  // ===================== ACTION HANDLERS =====================

  // -- Table Actions --

  handleAddTableAction() {
    this.tableActions = [
      ...this.tableActions,
      {
        order: this.tableActions.length + 1,
        label: '',
        type: 'flow',
        flowApiName: '',
        lwcName: '',
        dialogSize: 'Large'
      }
    ];
  }

  handleRemoveTableAction(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.tableActions = this.tableActions
      .filter((_, i) => i !== idx)
      .map((a, i) => ({ ...a, order: i + 1 }));
  }

  handleTableActionLabelChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.tableActions = this._updateActionAtIndex(this.tableActions, idx, {
      label: event.detail.value
    });
  }

  handleTableActionTypeChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.tableActions = this._updateActionAtIndex(this.tableActions, idx, {
      type: event.detail.value
    });
  }

  handleTableActionFlowChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.tableActions = this._updateActionAtIndex(this.tableActions, idx, {
      flowApiName: event.detail.value
    });
  }

  handleTableActionLwcChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.tableActions = this._updateActionAtIndex(this.tableActions, idx, {
      lwcName: event.detail.value
    });
  }

  handleTableActionDialogSizeChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.tableActions = this._updateActionAtIndex(this.tableActions, idx, {
      dialogSize: event.detail.value
    });
  }

  // -- Overflow Actions --

  handleAddOverflowAction() {
    this.overflowActions = [
      ...this.overflowActions,
      {
        order: this.overflowActions.length + 1,
        label: '',
        type: 'flow',
        flowApiName: '',
        lwcName: '',
        dialogSize: 'Large'
      }
    ];
  }

  handleRemoveOverflowAction(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.overflowActions = this.overflowActions
      .filter((_, i) => i !== idx)
      .map((a, i) => ({ ...a, order: i + 1 }));
  }

  handleOverflowActionLabelChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.overflowActions = this._updateActionAtIndex(
      this.overflowActions,
      idx,
      { label: event.detail.value }
    );
  }

  handleOverflowActionTypeChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.overflowActions = this._updateActionAtIndex(
      this.overflowActions,
      idx,
      { type: event.detail.value }
    );
  }

  handleOverflowActionFlowChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.overflowActions = this._updateActionAtIndex(
      this.overflowActions,
      idx,
      { flowApiName: event.detail.value }
    );
  }

  handleOverflowActionLwcChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.overflowActions = this._updateActionAtIndex(
      this.overflowActions,
      idx,
      { lwcName: event.detail.value }
    );
  }

  handleOverflowActionDialogSizeChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.overflowActions = this._updateActionAtIndex(
      this.overflowActions,
      idx,
      { dialogSize: event.detail.value }
    );
  }

  // -- Row Actions --

  handleAddRowAction() {
    this.rowActions = [
      ...this.rowActions,
      {
        order: this.rowActions.length + 1,
        name: '',
        label: '',
        type: 'flow',
        flowApiName: '',
        lwcName: '',
        dialogSize: 'Large'
      }
    ];
  }

  handleRemoveRowAction(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.rowActions = this.rowActions
      .filter((_, i) => i !== idx)
      .map((a, i) => ({ ...a, order: i + 1 }));
  }

  handleAddEditRowAction() {
    if (this.rowActions.some((a) => a.name === 'edit_row')) return;
    this.rowActions = [
      ...this.rowActions,
      {
        order: this.rowActions.length + 1,
        name: 'edit_row',
        label: 'Edit',
        type: 'builtin'
      }
    ];
  }

  handleAddDeleteRowAction() {
    if (this.rowActions.some((a) => a.name === 'delete_row')) return;
    this.rowActions = [
      ...this.rowActions,
      {
        order: this.rowActions.length + 1,
        name: 'delete_row',
        label: 'Delete',
        type: 'builtin'
      }
    ];
  }

  handleRowActionNameChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.rowActions = this._updateActionAtIndex(this.rowActions, idx, {
      name: event.detail.value
    });
  }

  handleRowActionLabelChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.rowActions = this._updateActionAtIndex(this.rowActions, idx, {
      label: event.detail.value
    });
  }

  handleRowActionTypeChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.rowActions = this._updateActionAtIndex(this.rowActions, idx, {
      type: event.detail.value
    });
  }

  handleRowActionFlowChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.rowActions = this._updateActionAtIndex(this.rowActions, idx, {
      flowApiName: event.detail.value
    });
  }

  handleRowActionLwcChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.rowActions = this._updateActionAtIndex(this.rowActions, idx, {
      lwcName: event.detail.value
    });
  }

  handleRowActionDialogSizeChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    this.rowActions = this._updateActionAtIndex(this.rowActions, idx, {
      dialogSize: event.detail.value
    });
  }

  // ===================== QUERY SETTINGS =====================

  handleWhereChange(event) {
    this.whereClause = event.detail.value;
    this._parseMergeTokens();
    if (this.contextRecordId && this._mergeTokens.length > 0) {
      this._fetchContextFieldValues();
    }
  }

  handleLimitChange(event) {
    this.rowLimit = event.detail.value;
  }

  handleDefaultSortFieldChange(event) {
    this.defaultSortField = event.detail.value;
  }

  handleDefaultSortDirectionChange(event) {
    this.defaultSortDirection = event.detail.value;
  }

  // ===================== DISPLAY SETTINGS =====================

  handleCheckboxTypeChange(event) {
    this.checkboxType = event.detail.value;
  }

  handleShowRecordCountChange(event) {
    this.showRecordCount = event.target.checked;
  }

  handleShowSearchChange(event) {
    this.showSearch = event.target.checked;
  }

  handleShowRefreshChange(event) {
    this.showRefresh = event.target.checked;
  }

  // ===================== CONTEXT RECORD =====================

  async handleContextObjectSearch(event) {
    this.contextObjectSearchTerm = event.detail.value;
    if (this.contextObjectApiName) {
      this.contextObjectApiName = '';
      this.contextObjectLabel = '';
      this.contextRecordId = '';
      this._contextFieldValues = {};
    }
    if (this.contextObjectSearchTerm.length < 1) {
      this.contextObjectResults = [];
      this.showContextObjectDropdown = false;
      return;
    }
    try {
      const results = await getSearchableObjects({
        searchTerm: this.contextObjectSearchTerm
      });
      this.contextObjectResults = results;
      this.showContextObjectDropdown = true;
    } catch (err) {
      // Silently handle search errors
      this.contextObjectResults = [];
      this.showContextObjectDropdown = false;

      console.debug('Context object search error:', err);
    }
  }

  handleContextObjectKeyUp(event) {
    if (event.key === 'Escape') {
      this.showContextObjectDropdown = false;
    }
  }

  handleContextObjectFocus() {
    if (this.contextObjectResults.length > 0 && !this.contextObjectApiName) {
      this.showContextObjectDropdown = true;
    }
  }

  handleContextObjectBlur() {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._contextBlurTimeout = setTimeout(() => {
      this.showContextObjectDropdown = false;
    }, 200);
  }

  handleContextObjectSelect(event) {
    if (this._contextBlurTimeout) {
      clearTimeout(this._contextBlurTimeout);
    }
    const apiName = event.currentTarget.dataset.apiName;
    const label = event.currentTarget.dataset.label;
    this.contextObjectApiName = apiName;
    this.contextObjectLabel = label;
    this.contextObjectSearchTerm = `${label} (${apiName})`;
    this.contextRecordId = '';
    this._contextFieldValues = {};
    this.showContextObjectDropdown = false;
    this.contextObjectResults = [];
  }

  handleContextRecordChange(event) {
    this.contextRecordId = event.detail.recordId || '';
    this._contextFieldValues = {};
    if (this.contextRecordId && this._mergeTokens.length > 0) {
      this._fetchContextFieldValues();
    }
  }

  // ===================== DELETE MODAL =====================

  handleDeleteClick() {
    this.showDeleteModal = true;
  }

  handleDeleteCancel() {
    this.showDeleteModal = false;
  }

  async handleDeleteConfirm() {
    this.showDeleteModal = false;
    this.isLoading = true;
    try {
      await deleteConfig({ configId: this.selectedConfigId });
      this._showToast(
        'Success',
        `Config "${this.configName}" deleted`,
        'success'
      );
      this.handleNew();
      await this._loadConfigs();
    } catch (error) {
      this._showToast(
        'Delete Error',
        error.body ? error.body.message : error.message,
        'error'
      );
    } finally {
      this.isLoading = false;
    }
  }

  // ===================== SAVE =====================

  async handleSave() {
    if (!this.configName) {
      this._showToast('Validation Error', 'Config Name is required', 'error');
      return;
    }

    this.isLoading = true;
    try {
      const configJson = JSON.stringify({
        objectApiName: this.selectedObject,
        fields: this.fields,
        actions: {
          tableActions: this.tableActions,
          overflowActions: this.overflowActions,
          rowActions: this.rowActions
        },
        lookupConfigs: this.lookupConfigs,
        querySettings: {
          whereClause: this.whereClause,
          limit: this.rowLimit,
          defaultSortField: this.defaultSortField,
          defaultSortDirection: this.defaultSortDirection
        },
        displaySettings: {
          showRecordCount: this.showRecordCount,
          showSearch: this.showSearch,
          showRefresh: this.showRefresh,
          checkboxType: this.checkboxType,
          editableFields: this.fields
            .filter((f) => f.visible && f.editable)
            .map((f) => f.fieldName)
        },
        viewState: {
          fieldVisibilityFilter: this.fieldVisibilityFilter,
          contextObjectApiName: this.contextObjectApiName,
          contextObjectLabel: this.contextObjectLabel,
          contextRecordId: this.contextRecordId
        }
      });

      const record = {
        Name: this.configName,
        Description__c: this.configDescription,
        Object_API_Name__c: this.selectedObject,
        Config_JSON__c: configJson
      };

      if (this.selectedConfigId) {
        record.Id = this.selectedConfigId;
      }

      const result = await saveConfig({ config: record });
      this.selectedConfigId = result.Id;
      await this._loadConfigs();
      this._showToast(
        'Success',
        `Config "${this.configName}" saved`,
        'success'
      );
    } catch (error) {
      this._showToast(
        'Save Error',
        error.body ? error.body.message : error.message,
        'error'
      );
    } finally {
      this.isLoading = false;
    }
  }

  // ===================== PRIVATE METHODS =====================

  async _loadConfigs() {
    try {
      const configs = await getConfigs();
      this._configsMap = new Map(configs.map((c) => [c.Id, c]));
      this.configOptions = [
        { label: '-- New Config --', value: '' },
        ...configs.map((c) => ({ label: c.Name, value: c.Id }))
      ];
    } catch (error) {
      this._showToast(
        'Error',
        'Failed to load configs: ' +
          (error.body ? error.body.message : error.message),
        'error'
      );
    }
  }

  async _loadFieldsForObject(objectApiName) {
    this.isLoading = true;
    try {
      const fieldData = await getObjectFields({
        objectApiName: objectApiName
      });
      if (fieldData.length === 0) {
        this._showToast(
          'No Fields Found',
          `No fields returned for "${objectApiName}".`,
          'warning'
        );
        this.selectedObject = '';
        this.fields = [];
      } else {
        this.fields = fieldData.map((f) => ({
          fieldName: f.fieldName,
          label: f.label,
          dataType: f.dataType,
          referenceTo: f.referenceTo || null,
          visible: true,
          sortable: true,
          editable: false,
          width: null,
          typeAttributesOverride: null
        }));
        this._showToast(
          'Success',
          `Loaded ${fieldData.length} fields for ${objectApiName}`,
          'success'
        );
      }
    } catch (error) {
      this.selectedObject = '';
      this.fields = [];
      this._showToast(
        'Error',
        error.body ? error.body.message : error.message,
        'error'
      );
    } finally {
      this.isLoading = false;
    }
  }

  async _restoreConfig(parsed) {
    this.selectedObject = parsed.objectApiName || '';
    this.objectSearchTerm = '';

    // Load fields from server first, then merge with saved config
    if (this.selectedObject) {
      await this._loadFieldsForObject(this.selectedObject);
      this.objectSearchTerm = this.selectedObject;
    } else {
      this.fields = [];
    }

    // Restore query settings
    const qs = parsed.querySettings || {};
    this.whereClause = qs.whereClause || '';
    this.rowLimit = qs.limit || 500;
    this.defaultSortField = qs.defaultSortField || '';
    this.defaultSortDirection = qs.defaultSortDirection || 'asc';

    // Restore display settings
    const ds = parsed.displaySettings || {};
    this.showRecordCount = ds.showRecordCount || false;
    this.showSearch = ds.showSearch || false;
    this.showRefresh = ds.showRefresh || false;
    this.checkboxType = ds.checkboxType || 'None';

    // Restore actions
    const actions = parsed.actions || {};
    this.tableActions = actions.tableActions || [];
    this.overflowActions = actions.overflowActions || [];
    this.rowActions = actions.rowActions || [];

    // Restore lookup configs
    this.lookupConfigs = parsed.lookupConfigs || {};

    // Restore view state
    const vs = parsed.viewState || {};
    this.fieldVisibilityFilter = vs.fieldVisibilityFilter || 'all';
    this.contextObjectApiName = vs.contextObjectApiName || '';
    this.contextObjectLabel = vs.contextObjectLabel || '';
    this.contextRecordId = vs.contextRecordId || '';
    if (this.contextObjectApiName && this.contextObjectLabel) {
      this.contextObjectSearchTerm = `${this.contextObjectLabel} (${this.contextObjectApiName})`;
    } else {
      this.contextObjectSearchTerm = '';
    }
    this._contextFieldValues = {};

    // Merge saved field config with loaded fields
    if (parsed.fields && this.fields.length > 0) {
      const loadedFieldMap = new Map(this.fields.map((f) => [f.fieldName, f]));
      const orderedFields = [];
      const seen = new Set();
      for (const cf of parsed.fields) {
        const loaded = loadedFieldMap.get(cf.fieldName);
        if (loaded) {
          orderedFields.push({
            ...loaded,
            visible: cf.visible !== false,
            label: cf.label || loaded.label,
            sortable: cf.sortable !== false,
            editable: cf.editable === true,
            width: cf.width || null,
            typeAttributesOverride: cf.typeAttributesOverride || null
          });
          seen.add(cf.fieldName);
        }
      }
      for (const f of this.fields) {
        if (!seen.has(f.fieldName)) {
          orderedFields.push({
            ...f,
            visible: false,
            sortable: true,
            editable: false
          });
        }
      }
      this.fields = orderedFields;
    }

    // Parse merge tokens and fetch context values if record was saved
    this._parseMergeTokens();
    if (this.contextRecordId && this._mergeTokens.length > 0) {
      this._fetchContextFieldValues();
    }

    this._previewKey++;
  }

  _parseMergeTokens() {
    const fullQuery = this.previewQueryString;
    if (!fullQuery) {
      this._mergeTokens = [];
      return;
    }
    const matches = fullQuery.match(/\$record\.(\w+)/g);
    if (!matches) {
      this._mergeTokens = [];
      return;
    }
    const fieldNames = [
      ...new Set(matches.map((m) => m.replace('$record.', '')))
    ];
    this._mergeTokens = fieldNames;
  }

  async _fetchContextFieldValues() {
    if (
      !this.contextObjectApiName ||
      !this.contextRecordId ||
      this._mergeTokens.length === 0
    ) {
      return;
    }
    try {
      const result = await getRecordFieldValues({
        objectApiName: this.contextObjectApiName,
        recordId: this.contextRecordId,
        fieldNames: this._mergeTokens
      });
      this._contextFieldValues = result || {};
    } catch (error) {
      this._contextFieldValues = {};
      this._showToast(
        'Context Error',
        error.body ? error.body.message : error.message,
        'error'
      );
    }
  }

  _refreshPreviewIfNeeded() {
    const query = this.resolvedPreviewQueryString;
    if (!query) return;
    const previewEl = this.template.querySelector('c-table-buddy');
    if (previewEl && typeof previewEl.refreshWithQuery === 'function') {
      // Debounce to avoid excessive calls

      clearTimeout(this._previewRefreshTimeout);
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this._previewRefreshTimeout = setTimeout(() => {
        previewEl.refreshWithQuery(query);
      }, 500);
    }
  }

  _updateField(fieldName, updates) {
    return this.fields.map((f) => {
      if (f.fieldName === fieldName) {
        return { ...f, ...updates };
      }
      return f;
    });
  }

  _updateActionAtIndex(actions, idx, updates) {
    return actions.map((a, i) => {
      if (i === idx) {
        return { ...a, ...updates };
      }
      return a;
    });
  }

  _getObjectLabel(apiName) {
    // Simple fallback: return the apiName itself if we don't have the label cached
    return apiName;
  }

  _showToast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }
}
