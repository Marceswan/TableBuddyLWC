import { LightningElement, api, wire } from 'lwc';
import { getPicklistValues } from 'lightning/uiObjectInfoApi';

const MASTER_RECORD_TYPE_ID = '012000000000000AAA';

export default class TableBuddyPicklistCell extends LightningElement {
  @api
  get picklistRecordTypeId() {
    return this._picklistRecordTypeId || MASTER_RECORD_TYPE_ID;
  }
  set picklistRecordTypeId(value) {
    this._picklistRecordTypeId = value || MASTER_RECORD_TYPE_ID;
  }

  get fieldDescribe() {
    return `${this.objectApiName}.${this.fieldApiName}`;
  }

  @api value;
  @api tableBoundary;
  @api rowKeyAttribute;
  @api rowKeyValue;
  @api isEditable;
  @api objectApiName;
  @api columnName;
  @api fieldApiName;

  get cellDisplayValue() {
    if (this._isCleared) return null;
    if (!this._valueToLabelMap || this._valueToLabelMap.size === 0)
      return this.value;
    if (!this._valueToLabelMap.has(this.value)) return this.value;
    if (this._valueToLabelMap.has(this.value))
      return this._valueToLabelMap.get(this.value);
    if (this._selectedValue)
      return this._valueToLabelMap.get(this._selectedValue);
    return this.value;
  }

  get editableCell() {
    return this.template.querySelector('c-table-buddy-editable-cell');
  }

  _isCleared = false;
  _errors = [];
  _valueToLabelMap = new Map();
  _picklistRecordTypeId;
  _selectedValue;
  _picklistOptions = [];

  @wire(getPicklistValues, {
    recordTypeId: '$picklistRecordTypeId',
    fieldApiName: '$fieldDescribe'
  })
  wiredPicklistValues({ error, data }) {
    if (error) {
      this._errors.push(error);
    } else if (data) {
      this._valueToLabelMap = new Map(
        data.values.map(({ label, value }) => [value, label])
      );
      this._picklistOptions = data.values.map(({ label, value }) => ({
        label,
        value
      }));
    }
  }

  handlePicklistConfigLoad(event) {
    const payload = event.detail.value;
    if (payload.recordTypeIdMap) {
      const rtMap = new Map(Object.entries(payload.recordTypeIdMap));
      this._picklistRecordTypeId = rtMap.get(this.rowKeyValue);
    }
  }

  handleSelected(event) {
    if (this.editableCell && this.editableCell.showMassEdit) return;
    this._selectedValue = event.detail.value;
    this._isCleared = !this._selectedValue;
  }

  handleReset() {
    this._isCleared = false;
    this._selectedValue = null;
  }

  handleSetDraftValue(event) {
    this._selectedValue = event.detail.draftValue;
    this._isCleared = !this._selectedValue;
  }
}
