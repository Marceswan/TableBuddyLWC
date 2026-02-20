import { api } from 'lwc';
import LightningModal from 'lightning/modal';

export default class TableBuddyFlowModal extends LightningModal {
  @api flowApiName;
  @api inputVariables = [];
  @api modalHeader = 'Flow';
  @api modalSize = 'large'; // small, medium, large

  _flowStatus;

  handleFlowStatusChange(event) {
    this._flowStatus = event.detail.status;
    if (
      this._flowStatus === 'FINISHED' ||
      this._flowStatus === 'FINISHED_SCREEN'
    ) {
      this.close({
        status: 'finished',
        outputVariables: event.detail.outputVariables
      });
    }
  }

  handleClose() {
    this.close({ status: 'cancelled' });
  }
}
