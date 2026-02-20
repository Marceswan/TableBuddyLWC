import { api } from 'lwc';
import LightningModal from 'lightning/modal';

export default class TableBuddyActionModal extends LightningModal {
  @api lwcName;
  @api modalHeader = 'Action';
  @api modalSize = 'large';
  @api actionPayload = {};

  _componentConstructor;

  async connectedCallback() {
    if (this.lwcName) {
      try {
        // Dynamic import: lwcName should be like 'c/myComponent'
        const module = await import(this.lwcName);
        this._componentConstructor = module.default;
      } catch (error) {
        console.error('Failed to load component:', this.lwcName, error);
      }
    }
  }

  get hasComponent() {
    return !!this._componentConstructor;
  }

  handleActionComplete(event) {
    this.close({ status: 'completed', result: event.detail });
  }

  handleClose() {
    this.close({ status: 'cancelled' });
  }
}
