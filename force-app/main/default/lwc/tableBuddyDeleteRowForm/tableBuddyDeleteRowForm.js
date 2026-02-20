import { api } from 'lwc';
import LightningModal from 'lightning/modal';
import { deleteRecord } from 'lightning/uiRecordApi';

export default class TableBuddyDeleteRowForm extends LightningModal {
  @api recordId;
  @api recordName;
  @api modalHeader = 'Delete Record';

  _isDeleting = false;
  _error;

  get confirmMessage() {
    const name = this.recordName ? ` "${this.recordName}"` : '';
    return `Are you sure you want to delete this record${name}? This action cannot be undone.`;
  }

  get hasError() {
    return !!this._error;
  }

  async handleDelete() {
    this._isDeleting = true;
    this._error = null;
    try {
      await deleteRecord(this.recordId);
      this.close({ status: 'deleted', recordId: this.recordId });
    } catch (error) {
      this._error =
        error.body?.message ||
        error.message ||
        'An error occurred while deleting the record.';
      this._isDeleting = false;
    }
  }

  handleClose() {
    this.close({ status: 'cancelled' });
  }
}
