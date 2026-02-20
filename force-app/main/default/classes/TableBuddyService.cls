public inherited sharing class TableBuddyService {
  // ── Constants ────────────────────────────────────────────────

  public static final Map<Schema.DisplayType, String> DISPLAY_TYPE_TO_DATATABLE_TYPE_MAP = new Map<Schema.DisplayType, String>{
    Schema.DisplayType.address => 'text',
    Schema.DisplayType.anytype => 'text',
    Schema.DisplayType.base64 => 'text',
    Schema.DisplayType.Boolean => 'boolean',
    Schema.DisplayType.Combobox => 'text',
    Schema.DisplayType.Currency => 'currency',
    Schema.DisplayType.Date => 'date-local',
    Schema.DisplayType.DateTime => 'date',
    Schema.DisplayType.Double => 'number',
    Schema.DisplayType.Email => 'email',
    Schema.DisplayType.EncryptedString => 'text',
    Schema.DisplayType.Long => 'number',
    Schema.DisplayType.Location => 'location',
    Schema.DisplayType.ID => 'text',
    Schema.DisplayType.Integer => 'number',
    Schema.DisplayType.MultiPicklist => 'text',
    Schema.DisplayType.Percent => 'percent',
    Schema.DisplayType.Phone => 'phone',
    Schema.DisplayType.Picklist => 'customPicklist',
    Schema.DisplayType.Reference => 'customLookup',
    Schema.DisplayType.String => 'text',
    Schema.DisplayType.TextArea => 'text',
    Schema.DisplayType.Time => 'text',
    Schema.DisplayType.URL => 'url'
  };

  private static final Set<String> AGGREGATE_QUERY_DELIMITERS = new Set<String>{
    'avg',
    'count',
    'count_distinct',
    'min',
    'max',
    'sum'
  };

  private static final Set<String> DATE_FUNCTION_DELIMITERS = new Set<String>{
    'calendar_month',
    'calendar_quarter',
    'calendar_year',
    'day_in_month',
    'day_in_week',
    'day_in_year',
    'day_only',
    'fiscal_month',
    'fiscal_quarter',
    'fiscal_year',
    'hour_in_day',
    'week_in_month',
    'week_in_year'
  };

  private static final Integer ROW_LIMITER = 500;
  private static Set<Id> RECORD_TYPE_IDS { private get; private set; }
  private static Map<String, String> LOOKUP_FIELD_TO_NAME_FIELD_MAP = new Map<String, String>();

  // ── Config CRUD ──────────────────────────────────────────────

  @AuraEnabled
  public static List<Table_Buddy_Config__c> getConfigs() {
    return [
      SELECT Id, Name, Description__c, Object_API_Name__c, Config_JSON__c
      FROM Table_Buddy_Config__c
      ORDER BY Name ASC
    ];
  }

  @AuraEnabled(cacheable=true)
  public static Table_Buddy_Config__c getConfigByName(String configName) {
    List<Table_Buddy_Config__c> configs = [
      SELECT Id, Name, Description__c, Object_API_Name__c, Config_JSON__c
      FROM Table_Buddy_Config__c
      WHERE Name = :configName
      LIMIT 1
    ];
    return configs.isEmpty() ? null : configs[0];
  }

  @AuraEnabled
  public static Table_Buddy_Config__c saveConfig(Table_Buddy_Config__c config) {
    upsert config;
    return config;
  }

  @AuraEnabled
  public static void deleteConfig(Id configId) {
    delete [SELECT Id FROM Table_Buddy_Config__c WHERE Id = :configId];
  }

  // ── Field Discovery ──────────────────────────────────────────

  @AuraEnabled
  public static List<Map<String, String>> getObjectFields(
    String objectApiName
  ) {
    if (String.isBlank(objectApiName)) {
      return new List<Map<String, String>>();
    }
    List<Map<String, String>> fields = getFieldsViaFieldDefinition(
      objectApiName
    );
    if (!fields.isEmpty()) {
      return fields;
    }
    return getFieldsViaDescribe(objectApiName);
  }

  @TestVisible
  private static List<Map<String, String>> getFieldsViaFieldDefinition(
    String objectApiName
  ) {
    List<Map<String, String>> fields = new List<Map<String, String>>();
    if (String.isBlank(objectApiName)) {
      return fields;
    }
    try {
      for (FieldDefinition fd : [
        SELECT QualifiedApiName, Label
        FROM FieldDefinition
        WHERE EntityDefinition.QualifiedApiName = :objectApiName
        ORDER BY QualifiedApiName ASC
      ]) {
        fields.add(
          new Map<String, String>{
            'fieldName' => fd.QualifiedApiName,
            'label' => fd.Label
          }
        );
      }
    } catch (Exception e) {
      System.debug(
        'FieldDefinition query failed for ' +
          objectApiName +
          ': ' +
          e.getMessage()
      );
    }
    return fields;
  }

  @TestVisible
  private static List<Map<String, String>> getFieldsViaDescribe(
    String objectApiName
  ) {
    List<Map<String, String>> fields = new List<Map<String, String>>();
    if (String.isBlank(objectApiName)) {
      return fields;
    }
    try {
      Schema.DescribeSObjectResult[] describes = Schema.describeSObjects(
        new List<String>{ objectApiName }
      );
      if (!describes.isEmpty()) {
        Map<String, Schema.SObjectField> fieldMap = describes[0]
          .fields.getMap();
        List<String> fieldNames = new List<String>(fieldMap.keySet());
        fieldNames.sort();
        for (String fieldName : fieldNames) {
          Schema.DescribeFieldResult dfr = fieldMap.get(fieldName)
            .getDescribe();
          fields.add(
            new Map<String, String>{
              'fieldName' => dfr.getName(),
              'label' => dfr.getLabel()
            }
          );
        }
      }
    } catch (Exception e) {
      System.debug(
        'describeSObjects failed for ' + objectApiName + ': ' + e.getMessage()
      );
    }
    return fields;
  }

  // ── Table Cache (Schema-Driven SOQL Execution) ──────────────

  @AuraEnabled
  public static Map<String, Object> getTableCache(
    Map<String, Object> tableRequest
  ) {
    if (!tableRequest.containsKey('queryString')) {
      throw new TableBuddyServiceException('Missing Query.');
    }
    String queryString = (String) tableRequest.get('queryString');
    String objectName = queryString.substringAfter(' FROM ').split(' ').get(0);
    SObject queryObject = Schema.getGlobalDescribe()
      .get(objectName)
      .newSObject();

    // Auto-add RecordTypeId if multi-type object
    if (
      recordTypeIdsForObject(objectName).size() > 1 &&
      !queryString.containsIgnoreCase('RecordTypeId')
    ) {
      queryString = addFieldToQueryString('RecordTypeId', queryString);
    }

    // Generate columns first (populates LOOKUP_FIELD_TO_NAME_FIELD_MAP)
    LOOKUP_FIELD_TO_NAME_FIELD_MAP = new Map<String, String>();
    List<Map<String, Object>> tableColumns = getColumnData(
      queryString,
      queryObject
    );

    // Auto-add lookup Name fields
    if (!LOOKUP_FIELD_TO_NAME_FIELD_MAP.isEmpty()) {
      for (String lookupNameField : LOOKUP_FIELD_TO_NAME_FIELD_MAP.values()) {
        if (
          !queryString.containsIgnoreCase(lookupNameField) &&
          !isAggregateQuery(queryString)
        ) {
          queryString = addFieldToQueryString(lookupNameField, queryString);
        }
      }
    }

    // Execute query with FLS enforcement
    List<SObject> tableData = getSObjectsWithAllowedFields(queryString);

    return new Map<String, Object>{
      'tableData' => tableData,
      'tableColumns' => tableColumns,
      'objectApiName' => objectName
    };
  }

  // ── Column Generation ────────────────────────────────────────

  @TestVisible
  private static List<Map<String, Object>> getColumnData(
    String queryString,
    SObject queriedSObject
  ) {
    String soqlFields = queryString.subString(
        queryString.indexOfIgnoreCase('select') + 7,
        queryString.indexOfIgnoreCase(' from ')
      )
      .trim();
    List<String> soqlColumns = soqlFields.split('[,]{1}[\\s]*');
    List<Map<String, Object>> tableColumns = new List<Map<String, Object>>();
    Map<String, Schema.SObjectField> fieldMap = queriedSObject.getSObjectType()
      .getDescribe()
      .fields.getMap();

    for (String fieldName : soqlColumns) {
      Schema.SObjectType currentSObjectType = queriedSObject.getSObjectType();
      Schema.DescribeFieldResult field;
      Map<String, Object> fieldColumn = new Map<String, Object>();

      if (fieldname == 'created') {
        continue;
      }

      // Aggregate queries and date functions
      if (isAggregateQuery(fieldName) || isDateFunction(fieldName)) {
        String aggLabel = getExpressionFieldLabel(fieldName);
        Schema.DisplayType displayType = isAggregateQuery(fieldName)
          ? Schema.DisplayType.INTEGER
          : Schema.DisplayType.STRING;
        fieldColumn.put('label', aggLabel);
        fieldColumn.put(
          'type',
          DISPLAY_TYPE_TO_DATATABLE_TYPE_MAP.get(displayType)
        );
        fieldColumn.put(
          'fieldName',
          getExpressionFieldName(fieldName, aggLabel)
        );
        tableColumns.add(fieldColumn);
        continue;
      }

      // Parent relationships
      if (fieldName.contains('.')) {
        String parentReference = fieldName.contains('__r')
          ? fieldName.substringBeforeLast('__r.') + '__c'
          : fieldName.substringBeforeLast('.') + 'Id';
        Schema.SObjectType referenceTo = fieldMap.get(parentReference)
          .getDescribe()
          .getReferenceTo()
          .get(0);
        currentSObjectType = referenceTo;
        field = referenceTo.getDescribe()
          .fields.getMap()
          .get(fieldName.substringAfterLast('.'))
          .getDescribe();
      } else {
        field = fieldMap.get(fieldName).getDescribe();
      }

      // FLS check
      if (!field.isAccessible()) {
        continue;
      }

      String flatFieldName = fieldName.contains('.')
        ? fieldName.replace('.', '_')
        : fieldName;
      fieldColumn.put('label', field.getLabel());
      fieldColumn.put(
        'type',
        DISPLAY_TYPE_TO_DATATABLE_TYPE_MAP.get(field.getType())
      );
      fieldColumn.put('fieldName', flatFieldName);

      // Name fields -> customName
      if (
        fieldName.equalsIgnoreCase('name') ||
        fieldName.substringAfterLast('.').equalsIgnoreCase('name')
      ) {
        fieldColumn.put('type', 'customName');
        Boolean isNameFieldForPrimaryObject =
          currentSObjectType.getDescribe().getName() ==
          queriedSObject.getSObjectType().getDescribe().getName();
        String hrefFieldValue = isNameFieldForPrimaryObject
          ? currentSObjectType.getDescribe().getName() + '_Id'
          : fieldName.substringBeforeLast('.') + '_Id';
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put(
          'href',
          new Map<String, Object>{ 'fieldName' => hrefFieldValue }
        );
        typeAttributes.put('target', '_parent');
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      String columnType = String.valueOf(fieldColumn.get('type'));

      // Formula fields with HYPERLINK/IMAGE
      if (field.isCalculated() && columnType.equalsIgnoreCase('text')) {
        String formulaValue = field.getCalculatedFormula();
        if (
          String.isNotBlank(formulaValue) &&
          (formulaValue.containsIgnoreCase('hyperlink') ||
          formulaValue.containsIgnoreCase('image'))
        ) {
          fieldColumn.put('type', 'customFormula');
          Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
          typeAttributes.put('isHtmlFormula', true);
          fieldColumn.put('typeAttributes', typeAttributes);
        }
      }

      if (columnType.equalsIgnoreCase('location')) {
        throw new TableBuddyServiceException(
          'Geolocation fields must be queried with __Longitude__s and __Latitude__s suffixes.'
        );
      }

      // Date typeAttributes
      if (columnType.equalsIgnoreCase('date-local')) {
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('year', 'numeric');
        typeAttributes.put('month', 'numeric');
        typeAttributes.put('day', 'numeric');
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      if (columnType.equalsIgnoreCase('date')) {
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('year', 'numeric');
        typeAttributes.put('month', 'numeric');
        typeAttributes.put('day', 'numeric');
        typeAttributes.put('hour', 'numeric');
        typeAttributes.put('minute', 'numeric');
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      // All custom types get these
      if (columnType.startsWithIgnoreCase('custom')) {
        String fieldNameParticle = fieldName.contains('.')
          ? fieldName.substringAfterLast('.')
          : fieldName;
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put('columnName', fieldNameParticle);
        typeAttributes.put(
          'objectApiName',
          currentSObjectType.getDescribe().getName()
        );
        typeAttributes.put('fieldApiName', fieldNameParticle);
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      // Picklist RecordType handling
      Boolean hasRecordTypes =
        recordTypeIdsForObject(currentSObjectType.getDescribe().getName())
          .size() > 1;
      if (columnType.equalsIgnoreCase('customPicklist') && hasRecordTypes) {
        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put(
          'picklistRecordTypeId',
          new Map<String, Object>{ 'fieldName' => 'RecordTypeId' }
        );
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      // Lookup name field resolution
      if (columnType.equalsIgnoreCase('customLookup')) {
        Boolean isCustomObjectLookup = field.getReferenceTo()
          .get(0)
          .getDescribe()
          .isCustom();
        String cleanFieldName = isCustomObjectLookup
          ? fieldName
          : fieldName.removeEnd('Id');
        String lookupNameField = getLookupNameField(field, cleanFieldName);
        String flattenedNameField = lookupNameField.replace('.', '_');
        String hrefFieldValue = cleanFieldName.replace('__c', '__r') + '_Id';

        LOOKUP_FIELD_TO_NAME_FIELD_MAP.put(cleanFieldName, lookupNameField);

        Map<String, Object> typeAttributes = getTypeAttributes(fieldColumn);
        typeAttributes.put(
          'href',
          new Map<String, Object>{ 'fieldName' => hrefFieldValue }
        );
        typeAttributes.put('target', '_parent');
        typeAttributes.put(
          'displayValue',
          new Map<String, Object>{ 'fieldName' => flattenedNameField }
        );
        typeAttributes.put(
          'referenceObjectApiName',
          field.getReferenceTo().get(0).getDescribe().getName()
        );
        fieldColumn.put('typeAttributes', typeAttributes);
      }

      tableColumns.add(fieldColumn);
    }
    return tableColumns;
  }

  // ── Query Validation ──────────────────────────────────────────

  @AuraEnabled(cacheable=true)
  public static String getQueryExceptionMessage(String queryString) {
    String errorMessage;
    try {
      Database.query(queryString);
    } catch (System.QueryException e) {
      errorMessage = e.getMessage();
    }
    return errorMessage;
  }

  // ── Context Record Lookups (Configurator Preview) ────────────

  @AuraEnabled(cacheable=true)
  public static List<Map<String, String>> getSearchableObjects(
    String searchTerm
  ) {
    String likeClause = String.isBlank(searchTerm)
      ? '%'
      : '%' + String.escapeSingleQuotes(searchTerm.trim()) + '%';
    List<Map<String, String>> results = new List<Map<String, String>>();
    for (EntityDefinition ed : [
      SELECT QualifiedApiName, Label
      FROM EntityDefinition
      WHERE Label LIKE :likeClause AND IsQueryable = TRUE
      ORDER BY Label ASC
      LIMIT 25
    ]) {
      String api = ed.QualifiedApiName;
      if (api.endsWith('__dll') || api.endsWith('__dlm')) {
        continue;
      }
      results.add(
        new Map<String, String>{ 'apiName' => api, 'label' => ed.Label }
      );
      if (results.size() >= 20) {
        break;
      }
    }
    return results;
  }

  @AuraEnabled
  public static Map<String, Object> getRecordFieldValues(
    String objectApiName,
    String recordId,
    List<String> fieldNames
  ) {
    if (
      String.isBlank(objectApiName) ||
      String.isBlank(recordId) ||
      fieldNames == null ||
      fieldNames.isEmpty()
    ) {
      return new Map<String, Object>();
    }
    List<String> safeFields = new List<String>();
    Pattern fieldPattern = Pattern.compile(
      '^[a-zA-Z][a-zA-Z0-9_]*(__[a-zA-Z0-9]+)?$'
    );
    for (String fn : fieldNames) {
      if (String.isNotBlank(fn) && fieldPattern.matcher(fn.trim()).matches()) {
        safeFields.add(String.escapeSingleQuotes(fn.trim()));
      }
    }
    if (safeFields.isEmpty()) {
      return new Map<String, Object>();
    }
    String fieldList = String.join(safeFields, ', ');
    String safeObject = String.escapeSingleQuotes(objectApiName.trim());
    String safeRecordId = String.escapeSingleQuotes(recordId.trim());
    String query =
      'SELECT ' +
      fieldList +
      ' FROM ' +
      safeObject +
      ' WHERE Id = \'' +
      safeRecordId +
      '\' LIMIT 1';

    List<SObject> rows;
    try {
      rows = Database.query(query);
    } catch (Exception e) {
      throw new TableBuddyServiceException(
        'Failed to query record fields: ' + e.getMessage()
      );
    }
    if (rows.isEmpty()) {
      return new Map<String, Object>();
    }
    Map<String, Object> result = new Map<String, Object>();
    Map<String, Object> populated = rows[0].getPopulatedFieldsAsMap();
    for (String fn : safeFields) {
      result.put(fn, populated.containsKey(fn) ? populated.get(fn) : null);
    }
    return result;
  }

  // ── RecordType Map (for picklist cells) ──────────────────────

  @AuraEnabled(cacheable=true)
  public static Map<Id, Id> getRecordTypeIdMap(List<Id> recordIds) {
    Map<Id, Id> recordTypeIdMap = new Map<Id, Id>();
    Set<String> objectNames = new Set<String>();
    for (Id recordId : recordIds) {
      objectNames.add(recordId.getSobjectType().getDescribe().getName());
    }
    if (objectNames.size() != 1) {
      throw new TableBuddyServiceException(
        'Only one type of SObject is allowed.'
      );
    }
    String objectName = new List<String>(objectNames)[0];
    if (recordTypeIdsForObject(objectName).size() > 1) {
      String queryString =
        'SELECT Id, RecordTypeId FROM ' +
        objectName +
        ' LIMIT ' +
        ROW_LIMITER;
      for (SObject obj : Database.query(queryString)) {
        recordTypeIdMap.put(obj.Id, (Id) obj.get('RecordTypeId'));
      }
    }
    return recordTypeIdMap;
  }

  // ── Private Helpers ──────────────────────────────────────────

  private static Map<String, Object> getTypeAttributes(
    Map<String, Object> fieldColumn
  ) {
    if (fieldColumn.get('typeAttributes') == null) {
      fieldColumn.put('typeAttributes', new Map<String, Object>());
    }
    return (Map<String, Object>) fieldColumn.get('typeAttributes');
  }

  private static Set<Id> recordTypeIdsForObject(String objectName) {
    if (RECORD_TYPE_IDS == null) {
      RECORD_TYPE_IDS = Schema.getGlobalDescribe()
        .get(objectName)
        .getDescribe()
        .getRecordTypeInfosById()
        .keySet();
    }
    return RECORD_TYPE_IDS;
  }

  private static String addFieldToQueryString(
    String field,
    String queryString
  ) {
    String queryStart = queryString.substringBefore(' FROM ');
    String queryEnd = queryString.substringAfter(' FROM ');
    return queryStart +
      ', ' +
      String.escapeSingleQuotes(field) +
      ' FROM ' +
      queryEnd;
  }

  private static Boolean isAggregateQuery(String queryString) {
    for (String delim : AGGREGATE_QUERY_DELIMITERS) {
      if (queryString.containsIgnoreCase(delim + '(')) {
        return true;
      }
    }
    return false;
  }

  private static Boolean isDateFunction(String fieldName) {
    for (String delim : DATE_FUNCTION_DELIMITERS) {
      if (fieldName.containsIgnoreCase(delim + '(')) {
        return true;
      }
    }
    return false;
  }

  private static Integer expressionNameCounter = 0;

  private static String getExpressionFieldLabel(String fieldName) {
    Integer expressionEnd = fieldName.indexOf(')') + 1;
    Boolean hasAlias = expressionEnd != fieldName.length();
    return hasAlias
      ? fieldName.substring(expressionEnd, fieldName.length()).trim()
      : fieldName;
  }

  private static String getExpressionFieldName(
    String fieldName,
    String fieldLabel
  ) {
    if (fieldName == fieldLabel) {
      String baseString = 'expr{0}';
      String returnString = String.format(
        baseString,
        new List<String>{ expressionNameCounter.format() }
      );
      expressionNameCounter++;
      return returnString;
    } else if (fieldName.indexOf(')') + 1 < fieldName.length()) {
      return fieldLabel;
    }
    return fieldName;
  }

  private static Boolean shouldAddLimit(String queryString) {
    return isAggregateQuery(queryString)
      ? queryString.containsIgnoreCase('group by')
      : true;
  }

  private static String getLookupNameField(
    Schema.DescribeFieldResult field,
    String cleanFieldName
  ) {
    Schema.SObjectField nameField;
    for (
      Schema.SObjectField curField : field.getReferenceTo()
        .get(0)
        .getDescribe()
        .fields.getMap()
        .values()
    ) {
      if (curField.getDescribe().isNameField()) {
        nameField = curField;
        break;
      }
    }
    return cleanFieldName.replace('__c', '__r') +
      '.' +
      nameField.getDescribe().getName();
  }

  private static List<SObject> getSObjectsWithAllowedFields(
    String queryString
  ) {
    if (
      !queryString.containsIgnoreCase(' LIMIT ') && shouldAddLimit(queryString)
    ) {
      queryString += ' LIMIT ' + ROW_LIMITER;
    }
    try {
      List<SObject> queriedRecords = Database.query(queryString);
      if (isAggregateQuery(queryString)) {
        return queriedRecords;
      }
      return Security.stripInaccessible(AccessType.READABLE, queriedRecords)
        .getRecords();
    } catch (Exception e) {
      throw new TableBuddyServiceException(e.getMessage());
    }
  }

  @TestVisible
  private class TableBuddyServiceException extends Exception {
  }
}
