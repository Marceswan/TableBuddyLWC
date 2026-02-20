import { api } from 'lwc';
import LightningModal from 'lightning/modal';

export default class TableBuddyActionModal extends LightningModal {
  @api lwcName;
  @api modalHeader = 'Action';
  @api modalSize = 'large';
  @api actionPayload = {};

  get payloadSummary() {
    const rows = this.actionPayload?.selectedRows;
    if (rows && rows.length) {
      return `${rows.length} row(s) selected`;
    }
    return 'No rows selected';
  }

  get selectedRowIds() {
    const rows = this.actionPayload?.selectedRows || [];
    return rows.map((r) => r.Id).filter(Boolean);
  }

  get hasSelectedRows() {
    return this.selectedRowIds.length > 0;
  }

  handleComplete() {
    this.close({ status: 'completed', result: this.actionPayload });
  }

  handleClose() {
    this.close({ status: 'cancelled' });
  }
}
