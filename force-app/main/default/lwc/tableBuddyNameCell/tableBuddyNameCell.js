import { LightningElement, api } from 'lwc';

export default class TableBuddyNameCell extends LightningElement {
  @api
  get href() {
    if (!this.value) return null;
    if (this._href) return this._href;
    if (this.value.startsWith('/')) return this.value;
    return `/${this.value}`;
  }
  set href(value) {
    this._href = value && value.startsWith('/') ? value : `/${value}`;
  }
  @api target = '_parent';
  @api value;
  @api tableBoundary;
  @api rowKeyAttribute;
  @api rowKeyValue;
  @api isEditable;
  @api objectApiName;
  @api columnName;
  @api fieldApiName;
  @api isCompoundName;
}
