import { LightningElement, api } from 'lwc';

export default class TableBuddyFormulaCell extends LightningElement {
  @api isHtmlFormula;
  @api value;
  @api tableBoundary;
  @api rowKeyAttribute;
  @api rowKeyValue;
  @api objectApiName;
  @api columnName;
  @api fieldApiName;

  _isRendered;

  get container() {
    return this.template.querySelector('.container');
  }

  renderedCallback() {
    if (this._isRendered) return;
    this._isRendered = true;
    if (this.isHtmlFormula && this.value) {
      // eslint-disable-next-line @lwc/lwc/no-inner-html
      this.container.innerHTML = this.value;
    }
  }
}
