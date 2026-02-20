import LightningDatatable from 'lightning/datatable';
import customName from './customName.html';
import customPicklist from './customPicklist.html';
import customLookup from './customLookup.html';
import customFormula from './customFormula.html';

export default class TableBuddyDatatable extends LightningDatatable {
  static customTypes = {
    customName: {
      template: customName,
      typeAttributes: [
        'href',
        'target',
        'tableBoundary',
        'rowKeyAttribute',
        'rowKeyValue',
        'isEditable',
        'objectApiName',
        'columnName',
        'fieldApiName',
        'isCompoundName'
      ]
    },
    customPicklist: {
      template: customPicklist,
      typeAttributes: [
        'picklistRecordTypeId',
        'tableBoundary',
        'rowKeyAttribute',
        'rowKeyValue',
        'isEditable',
        'objectApiName',
        'columnName',
        'fieldApiName'
      ]
    },
    customLookup: {
      template: customLookup,
      typeAttributes: [
        'href',
        'target',
        'displayValue',
        'referenceObjectApiName',
        'tableBoundary',
        'rowKeyAttribute',
        'rowKeyValue',
        'isEditable',
        'objectApiName',
        'columnName',
        'fieldApiName'
      ]
    },
    customFormula: {
      template: customFormula,
      typeAttributes: [
        'isHtmlFormula',
        'tableBoundary',
        'rowKeyAttribute',
        'rowKeyValue',
        'objectApiName',
        'columnName',
        'fieldApiName'
      ]
    }
  };
}
