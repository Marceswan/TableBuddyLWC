import { api } from 'lwc';
import LightningModal from 'lightning/modal';

export default class TableBuddyEditRowForm extends LightningModal {
  @api recordId;
  @api objectApiName;
  @api editableFields = [];
  @api modalHeader = 'Edit Record';

  handleSuccess() {
    this.close({ status: 'saved', recordId: this.recordId });
  }

  handleError(event) {
    console.error('Edit form error:', event.detail);
  }

  handleClose() {
    this.close({ status: 'cancelled' });
  }

  handleSubmit() {
    this.template.querySelector('lightning-record-edit-form').submit();
  }
}
