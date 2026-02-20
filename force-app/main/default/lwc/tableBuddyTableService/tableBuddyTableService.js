import getTableCache from "@salesforce/apex/TableBuddyService.getTableCache";
import getQueryExceptionMessage from "@salesforce/apex/TableBuddyService.getQueryExceptionMessage";
import { updateRecord } from "lightning/uiRecordApi";
import { isRecordId, reduceErrors } from "c/tableBuddyMessageService";

// ── Internal Helpers ──────────────────────────────────────────────────────────

const flattenObject = (propName, obj) => {
  let flatObject = {};
  for (let prop in obj) {
    if (prop) {
      let propIsNumber = isNaN(propName);
      let preAppend = propIsNumber ? `${propName}_` : "";
      if (typeof obj[prop] == "object") {
        flatObject[preAppend + prop] = {
          ...flatObject,
          ...flattenObject(preAppend + prop, obj[prop])
        };
      } else {
        flatObject[preAppend + prop] = obj[prop];
      }
    }
  }
  return flatObject;
};

// ── Exported Functions ────────────────────────────────────────────────────────

const flattenQueryResult = (listOfObjects, objectApiName) => {
  let finalArr = [];
  for (let i = 0; i < listOfObjects.length; i++) {
    let obj = listOfObjects[i];
    for (let prop in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
        continue;
      }
      if (typeof obj[prop] === "object" && !Array.isArray(obj[prop])) {
        obj = { ...obj, ...flattenObject(prop, obj[prop]) };
      } else if (Array.isArray(obj[prop])) {
        for (let j = 0; j < obj[prop].length; j++) {
          obj[`${prop}_${j}`] = { ...obj, ...flattenObject(prop, obj[prop]) };
        }
      }
      if (prop === "Id" && objectApiName) {
        const objectIdProp = { [`${objectApiName}_Id`]: obj[prop] };
        obj = { ...obj, ...objectIdProp };
      }
    }
    finalArr.push(obj);
  }
  return finalArr;
};

const createDatatableErrorRow = (error, recordInput) => {
  const originalRecord = { ...recordInput.fields };
  let errorMessages = [];
  let errorFields = [];
  if (!error.body.output) {
    errorMessages = [error.body.message];
  }
  if (error.body.output && error.body.output.fieldErrors) {
    errorFields = Object.keys(error.body.output.fieldErrors);
    errorMessages = reduceErrors(error);
  }
  const errorRow = {
    [originalRecord.Id]: {
      title: `${errorMessages.length} error(s) on this row`,
      messages: errorMessages,
      fieldNames: errorFields
    }
  };
  return errorRow;
};

const createDataTableError = (datatableErrorRows, recordIdToRowNumberMap) => {
  let tableMessages = [];
  const errorMap = new Map(Object.entries(datatableErrorRows));
  for (let [key, value] of errorMap.entries()) {
    value.rowNumber = recordIdToRowNumberMap.get(key);
    value.messages.forEach((msg) => {
      tableMessages.push(`Row ${value.rowNumber}: ${msg}`);
    });
  }
  return {
    title: `Found ${Object.keys(datatableErrorRows).length} error rows`,
    messages: tableMessages.sort()
  };
};

const checkQueryException = async (queryString) => {
  return getQueryExceptionMessage({ queryString: queryString });
};

const fetchTableCache = async (requestConfig) => {
  const cache = await getTableCache({ tableRequest: requestConfig });
  return {
    objectApiName: cache.objectApiName,
    tableData: flattenQueryResult(cache.tableData, cache.objectApiName),
    tableColumns: cache.tableColumns
  };
};

const updateDraftValues = async (draftValues, recordIdToRowNumberMap) => {
  let response;
  const recordInputs = draftValues.map((draftRow) => {
    const fields = { ...draftRow };
    return { fields };
  });
  try {
    const saveResults = {
      success: [],
      errors: {
        rows: {},
        table: {}
      }
    };
    await Promise.all(
      recordInputs.map(async (recordInput) => {
        try {
          const successResult = await updateRecord(recordInput);
          saveResults.success.push(successResult);
        } catch (error) {
          const errorRow = createDatatableErrorRow(error, recordInput);
          saveResults.errors.rows = { ...saveResults.errors.rows, ...errorRow };
        }
      })
    );
    saveResults.errors.table = createDataTableError(
      saveResults.errors.rows,
      recordIdToRowNumberMap
    );
    response = saveResults;
  } catch (error) {
    response = error;
  }
  return response;
};

export {
  isRecordId,
  checkQueryException,
  fetchTableCache,
  updateDraftValues,
  flattenQueryResult,
  createDatatableErrorRow,
  createDataTableError
};
