import { LightningElement, api, wire } from "lwc";
import {
  subscribe,
  unsubscribe,
  publish,
  MessageContext
} from "lightning/messageService";
import TABLE_BUDDY_CHANNEL from "@salesforce/messageChannel/TableBuddyChannel__c";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

// ── Inline Utility Functions ──────────────────────────────────────────────────

const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const isRecordId = (string) => {
  const re = new RegExp("[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}");
  return !!string?.match(re);
};

const reduceErrors = (errors) => {
  if (!Array.isArray(errors)) {
    errors = [errors];
  }
  return errors
    .filter((error) => !!error)
    .map((error) => {
      if (Array.isArray(error.body)) {
        return error.body.map((e) => e.message);
      } else if (
        error.body &&
        error.body.enhancedErrorType &&
        error.body.enhancedErrorType.toLowerCase() === "recorderror" &&
        error.body.output
      ) {
        let firstError = "";
        if (
          error.body.output.errors.length &&
          error.body.output.errors[0].errorCode.includes("_")
        ) {
          firstError = error.body.output.errors[0].message;
        }
        if (!error.body.output.errors.length && error.body.output.fieldErrors) {
          firstError =
            error.body.output.fieldErrors[
              Object.keys(error.body.output.fieldErrors)[0]
            ][0].message;
        }
        return firstError;
      } else if (error.body && typeof error.body.message === "string") {
        let errorMessage = error.body.message;
        if (typeof error.body.stackTrace === "string") {
          errorMessage += `\n${error.body.stackTrace}`;
        }
        return errorMessage;
      } else if (
        error.body &&
        error.body.pageErrors &&
        error.body.pageErrors.length
      ) {
        return error.body.pageErrors[0].message;
      } else if (typeof error.message === "string") {
        return error.message;
      }
      return error.statusText;
    })
    .reduce((prev, curr) => prev.concat(curr), [])
    .filter((message) => !!message);
};

// ── Component ─────────────────────────────────────────────────────────────────

export default class TableBuddyMessageService extends LightningElement {
  @api boundary;
  @api
  get useRecordIdAsBoundary() {
    return this._useRecordIdAsBoundary;
  }
  set useRecordIdAsBoundary(value = false) {
    this._useRecordIdAsBoundary = value;
  }

  subscription = null;

  @wire(MessageContext)
  messageContext;

  connectedCallback() {
    if (this.subscription) {
      return;
    }
    if (!this.useRecordIdAsBoundary) {
      this._useRecordIdAsBoundary =
        this.boundary && this._isBoundaryRecordId(this.boundary);
    }
    this.subscription = subscribe(
      this.messageContext,
      TABLE_BUDDY_CHANNEL,
      (payload) => this._handleChannelPayload(payload)
    );
  }

  disconnectedCallback() {
    unsubscribe(this.subscription);
    this.subscription = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  @api
  publish(payload) {
    if (this.boundary) {
      this._publishWithBoundary(payload);
    } else {
      this._publishOpen(payload);
    }
  }

  @api
  publishOpen(payload) {
    this._publishOpen(payload);
  }

  @api
  notifyClose() {
    this._publishOpen({ key: "closedialog" });
  }

  @api
  notifyBoundaryClose() {
    this._publishWithBoundary({ key: "closedialog" });
  }

  @api
  openModal(payload) {
    this.dispatchEvent(
      new CustomEvent("openmodal", { detail: { value: payload } })
    );
  }

  @api
  notifySuccess(title, message = null) {
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: message,
        variant: "success"
      })
    );
  }

  @api
  notifyInfo(title, message = null) {
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: message,
        variant: "info"
      })
    );
  }

  @api
  notifySingleError(title, error = "") {
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: reduceErrors(error)[0],
        variant: "error",
        mode: "sticky"
      })
    );
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _handleChannelPayload(payload) {
    if (!this._hasBoundaryProp(payload)) {
      this._dispatchKeyValueEvent(payload);
    } else {
      if (!this.useRecordIdAsBoundary && payload.boundary === this.boundary) {
        this._dispatchKeyValueEvent(payload);
      }
      if (
        this.useRecordIdAsBoundary &&
        this._isBoundaryRecordId(this.boundary) &&
        this._isBoundaryRecordId(payload.boundary) &&
        payload.boundary === this.boundary
      ) {
        this._dispatchKeyValueEvent(payload);
      }
    }
  }

  _publishOpen(payload) {
    publish(this.messageContext, TABLE_BUDDY_CHANNEL, {
      key: payload.key,
      value: payload.value
    });
  }

  _publishWithBoundary(payload) {
    publish(this.messageContext, TABLE_BUDDY_CHANNEL, {
      boundary: this.boundary,
      key: payload.key,
      value: payload.value
    });
  }

  _dispatchKeyValueEvent(payload) {
    this.dispatchEvent(
      new CustomEvent(payload.key, { detail: { value: payload.value } })
    );
  }

  _hasBoundaryProp(payload) {
    return Object.prototype.hasOwnProperty.call(payload, "boundary");
  }

  _isBoundaryRecordId(boundary) {
    return isRecordId(boundary);
  }
}

// Export utility functions for use by other components
export { generateUUID, isRecordId, reduceErrors };
