import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

export default class TableBuddyLookupCell extends LightningElement {
  @api
  get href() {
    if (!this.value || this._isCleared) return null;
    if (this._href) return this._href;
    if (this._selectedRecordId) return `/${this._selectedRecordId}`;
    if (this.value.startsWith('/')) return this.value;
    return `/${this.value}`;
  }
  set href(value) {
    this._href = value && value.startsWith('/') ? value : `/${value}`;
  }
  @api target = '_parent';
  @api displayValue;
  @api referenceObjectApiName;

  @api value;
  @api tableBoundary;
  @api rowKeyAttribute;
  @api rowKeyValue;
  @api isEditable;
  @api objectApiName;
  @api columnName;
  @api fieldApiName;

  @wire(getRecord, { recordId: '$_selectedRecordId', fields: '$_titleField' })
  lookupRecord;

  configIconName;
  configTitle;
  configSubtitle;

  get editableCell() {
    return this.template.querySelector('c-table-buddy-editable-cell');
  }

  _isCleared = false;
  _titleField;
  _selectedRecordId;

  get cellDisplayValue() {
    if (this._isCleared) return null;
    if (this._selectedRecordId) return this.lookupTitleField;
    if (this.value && !this.displayValue) {
      this._selectedRecordId = this.value;
      return this.lookupTitleField;
    }
    return this.displayValue;
  }

  get lookupTitleField() {
    return getFieldValue(this.lookupRecord.data, this._titleField);
  }

  // JSON-based lookup config (not CMDT)
  handleLookupConfigLoad(event) {
    const payload = event.detail.value;
    if (payload.lookupConfigs) {
      const lookupMap = new Map(Object.entries(payload.lookupConfigs));
      const cellConfig = lookupMap.has(this.referenceObjectApiName)
        ? lookupMap.get(this.referenceObjectApiName)
        : lookupMap.get('All');
      if (cellConfig) {
        this.configIconName = cellConfig.iconName;
        this.configTitle = cellConfig.titleField;
        this.configSubtitle = cellConfig.subtitleField;
        this._titleField = `${this.referenceObjectApiName}.${this.configTitle}`;
      }
    }
  }

  handleSelected(event) {
    if (this.editableCell && this.editableCell.showMassEdit) return;
    this._selectedRecordId = event.detail.recordId;
    this._isCleared = !this._selectedRecordId;
  }

  handleReset() {
    this._isCleared = false;
    this._selectedRecordId = null;
  }

  handleSetDraftValue(event) {
    this._selectedRecordId = event.detail.draftValue;
    this._isCleared = !this._selectedRecordId;
  }
}
