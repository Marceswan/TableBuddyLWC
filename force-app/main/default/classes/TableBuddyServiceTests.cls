@IsTest
private class TableBuddyServiceTests {
  @TestSetup
  static void setup() {
    Table_Buddy_Config__c config = new Table_Buddy_Config__c(
      Name = 'Test Config',
      Description__c = 'Test description',
      Object_API_Name__c = 'Account',
      Config_JSON__c = '{"objectApiName":"Account","fields":[{"fieldName":"Name","label":"Name","visible":true}]}'
    );
    insert config;
  }

  // ── Config CRUD Tests ──────────────────────────────────────

  @IsTest
  static void getConfigs_returns_all_configs() {
    Test.startTest();
    List<Table_Buddy_Config__c> configs = TableBuddyService.getConfigs();
    Test.stopTest();
    System.assertEquals(1, configs.size());
    System.assertEquals('Test Config', configs[0].Name);
  }

  @IsTest
  static void getConfigByName_returns_matching_config() {
    Test.startTest();
    Table_Buddy_Config__c config = TableBuddyService.getConfigByName(
      'Test Config'
    );
    Test.stopTest();
    System.assertNotEquals(null, config);
    System.assertEquals('Test Config', config.Name);
    System.assertEquals('Test description', config.Description__c);
  }

  @IsTest
  static void getConfigByName_returns_null_for_missing() {
    Test.startTest();
    Table_Buddy_Config__c config = TableBuddyService.getConfigByName(
      'Nonexistent'
    );
    Test.stopTest();
    System.assertEquals(null, config);
  }

  @IsTest
  static void saveConfig_inserts_new_config() {
    Table_Buddy_Config__c newConfig = new Table_Buddy_Config__c(
      Name = 'New Config',
      Description__c = 'New description',
      Object_API_Name__c = 'Contact',
      Config_JSON__c = '{"objectApiName":"Contact","fields":[]}'
    );
    Test.startTest();
    Table_Buddy_Config__c result = TableBuddyService.saveConfig(newConfig);
    Test.stopTest();
    System.assertNotEquals(null, result.Id);
    System.assertEquals('New Config', result.Name);
  }

  @IsTest
  static void saveConfig_updates_existing_config() {
    Table_Buddy_Config__c existing = [
      SELECT Id, Name, Description__c
      FROM Table_Buddy_Config__c
      LIMIT 1
    ];
    existing.Description__c = 'Updated description';
    Test.startTest();
    Table_Buddy_Config__c result = TableBuddyService.saveConfig(existing);
    Test.stopTest();
    Table_Buddy_Config__c refreshed = [
      SELECT Description__c
      FROM Table_Buddy_Config__c
      WHERE Id = :result.Id
    ];
    System.assertEquals('Updated description', refreshed.Description__c);
  }

  @IsTest
  static void deleteConfig_removes_config() {
    Table_Buddy_Config__c existing = [
      SELECT Id
      FROM Table_Buddy_Config__c
      LIMIT 1
    ];
    Test.startTest();
    TableBuddyService.deleteConfig(existing.Id);
    Test.stopTest();
    List<Table_Buddy_Config__c> remaining = [
      SELECT Id
      FROM Table_Buddy_Config__c
    ];
    System.assertEquals(0, remaining.size());
  }

  // ── Field Discovery Tests ──────────────────────────────────

  @IsTest
  static void getObjectFields_returns_fields_for_standard_object() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getObjectFields(
      'Account'
    );
    Test.stopTest();
    System.assert(fields.size() > 0, 'Expected at least one field');
    System.assert(fields[0].containsKey('fieldName'));
    System.assert(fields[0].containsKey('label'));
  }

  @IsTest
  static void getObjectFields_returns_empty_for_blank() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getObjectFields('');
    Test.stopTest();
    System.assertEquals(0, fields.size());
  }

  @IsTest
  static void getFieldsViaFieldDefinition_returns_empty_for_null() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getFieldsViaFieldDefinition(
      null
    );
    Test.stopTest();
    System.assertEquals(0, fields.size());
  }

  @IsTest
  static void getFieldsViaDescribe_returns_fields_for_standard_object() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getFieldsViaDescribe(
      'Account'
    );
    Test.stopTest();
    System.assert(fields.size() > 0);
  }

  @IsTest
  static void getFieldsViaDescribe_returns_empty_for_null() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getFieldsViaDescribe(
      null
    );
    Test.stopTest();
    System.assertEquals(0, fields.size());
  }

  @IsTest
  static void getFieldsViaDescribe_returns_empty_for_invalid_object() {
    Test.startTest();
    List<Map<String, String>> fields = TableBuddyService.getFieldsViaDescribe(
      'FakeObject__xyz'
    );
    Test.stopTest();
    System.assertEquals(0, fields.size());
  }

  // ── Table Cache Tests ──────────────────────────────────────

  @IsTest
  static void getTableCache_returns_data_and_columns() {
    Account testAcc = new Account(Name = 'Cache Test');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{
        'queryString' => 'SELECT Id, Name FROM Account LIMIT 5'
      }
    );
    Test.stopTest();
    System.assertNotEquals(null, result.get('tableData'));
    System.assertNotEquals(null, result.get('tableColumns'));
    System.assertEquals('Account', result.get('objectApiName'));
  }

  @IsTest
  static void getTableCache_throws_for_missing_query() {
    try {
      TableBuddyService.getTableCache(new Map<String, Object>());
      System.assert(false, 'Expected exception');
    } catch (Exception e) {
      System.assert(e.getMessage().contains('Missing Query'));
    }
  }

  @IsTest
  static void getTableCache_handles_parent_relationship() {
    Contact c = new Contact(LastName = 'Parent Test');
    insert c;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{
        'queryString' => 'SELECT Id, Account.Name FROM Contact LIMIT 5'
      }
    );
    Test.stopTest();
    System.assertNotEquals(null, result.get('tableColumns'));
  }

  @IsTest
  static void getTableCache_generates_name_column_type() {
    Account testAcc = new Account(Name = 'Name Type Test');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{
        'queryString' => 'SELECT Id, Name FROM Account LIMIT 1'
      }
    );
    Test.stopTest();
    List<Map<String, Object>> columns = (List<Map<String, Object>>) result.get(
      'tableColumns'
    );
    Boolean foundCustomName = false;
    for (Map<String, Object> col : columns) {
      if (col.get('type') == 'customName') {
        foundCustomName = true;
      }
    }
    System.assert(foundCustomName, 'Expected customName type for Name field');
  }

  @IsTest
  static void getTableCache_generates_lookup_column_type() {
    Account testAcc = new Account(Name = 'Lookup Type Test');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{
        'queryString' => 'SELECT Id, OwnerId FROM Account LIMIT 1'
      }
    );
    Test.stopTest();
    List<Map<String, Object>> columns = (List<Map<String, Object>>) result.get(
      'tableColumns'
    );
    Boolean foundCustomLookup = false;
    for (Map<String, Object> col : columns) {
      if (col.get('type') == 'customLookup') {
        foundCustomLookup = true;
      }
    }
    System.assert(
      foundCustomLookup,
      'Expected customLookup type for OwnerId field'
    );
  }

  @IsTest
  static void getTableCache_auto_adds_limit() {
    Account testAcc = new Account(Name = 'Limit Test');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{ 'queryString' => 'SELECT Id FROM Account' }
    );
    Test.stopTest();
    List<SObject> data = (List<SObject>) result.get('tableData');
    System.assert(data.size() <= 500);
  }

  @IsTest
  static void getTableCache_handles_invalid_query() {
    try {
      TableBuddyService.getTableCache(
        new Map<String, Object>{
          'queryString' => 'SELECT InvalidField FROM Account'
        }
      );
      System.assert(false, 'Expected exception');
    } catch (Exception e) {
      System.assertNotEquals(null, e.getMessage());
    }
  }

  // ── Query Validation Tests ─────────────────────────────────

  @IsTest
  static void getQueryExceptionMessage_returns_null_for_valid() {
    System.assertEquals(
      null,
      TableBuddyService.getQueryExceptionMessage(
        'SELECT Id FROM Account LIMIT 1'
      )
    );
  }

  @IsTest
  static void getQueryExceptionMessage_returns_error_for_invalid() {
    String result = TableBuddyService.getQueryExceptionMessage(
      'SELECT FakeField FROM Account'
    );
    System.assertNotEquals(null, result);
  }

  // ── Searchable Objects Tests ───────────────────────────────

  @IsTest
  static void getSearchableObjects_returns_results() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects(
      'Account'
    );
    Test.stopTest();
    System.assert(results.size() > 0);
    Boolean foundAccount = false;
    for (Map<String, String> r : results) {
      if (r.get('apiName') == 'Account') {
        foundAccount = true;
      }
    }
    System.assert(foundAccount);
  }

  @IsTest
  static void getSearchableObjects_handles_blank() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects(
      ''
    );
    Test.stopTest();
    System.assert(results.size() > 0);
    System.assert(results.size() <= 20);
  }

  @IsTest
  static void getSearchableObjects_handles_null() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects(
      null
    );
    Test.stopTest();
    System.assert(results.size() > 0);
  }

  @IsTest
  static void getSearchableObjects_excludes_dc_objects() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects(
      ''
    );
    Test.stopTest();
    for (Map<String, String> r : results) {
      String apiName = r.get('apiName');
      System.assert(!apiName.endsWith('__dll'));
      System.assert(!apiName.endsWith('__dlm'));
    }
  }

  @IsTest
  static void getSearchableObjects_returns_empty_for_gibberish() {
    Test.startTest();
    List<Map<String, String>> results = TableBuddyService.getSearchableObjects(
      'zzzzznonexistent999'
    );
    Test.stopTest();
    System.assertEquals(0, results.size());
  }

  // ── Record Field Values Tests ──────────────────────────────

  @IsTest
  static void getRecordFieldValues_returns_values() {
    Account a = new Account(Name = 'Context Test', Industry = 'Technology');
    insert a;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      'Account',
      a.Id,
      new List<String>{ 'Name', 'Industry' }
    );
    Test.stopTest();
    System.assertEquals('Context Test', result.get('Name'));
    System.assertEquals('Technology', result.get('Industry'));
  }

  @IsTest
  static void getRecordFieldValues_returns_empty_for_blank_object() {
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      '',
      'someId',
      new List<String>{ 'Name' }
    );
    System.assertEquals(0, result.size());
  }

  @IsTest
  static void getRecordFieldValues_returns_empty_for_null_record_id() {
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      'Account',
      null,
      new List<String>{ 'Name' }
    );
    System.assertEquals(0, result.size());
  }

  @IsTest
  static void getRecordFieldValues_returns_empty_for_empty_fields() {
    Account a = new Account(Name = 'Test');
    insert a;
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      'Account',
      a.Id,
      new List<String>()
    );
    System.assertEquals(0, result.size());
  }

  @IsTest
  static void getRecordFieldValues_returns_empty_for_nonexistent() {
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      'Account',
      '001000000000000AAA',
      new List<String>{ 'Name' }
    );
    System.assertEquals(0, result.size());
  }

  @IsTest
  static void getRecordFieldValues_filters_invalid_field_names() {
    Account a = new Account(Name = 'Filter Test');
    insert a;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getRecordFieldValues(
      'Account',
      a.Id,
      new List<String>{ 'Name', 'DROP TABLE', '' }
    );
    Test.stopTest();
    System.assert(result.containsKey('Name'));
    System.assertEquals('Filter Test', result.get('Name'));
  }

  // ── RecordType Map Tests ───────────────────────────────────

  @IsTest
  static void getRecordTypeIdMap_returns_map_for_valid_ids() {
    Account a = new Account(Name = 'RT Test');
    insert a;
    Test.startTest();
    Map<Id, Id> result = TableBuddyService.getRecordTypeIdMap(
      new List<Id>{ a.Id }
    );
    Test.stopTest();
    // May or may not have multiple record types depending on org
    System.assertNotEquals(null, result);
  }

  // ── Picklist Tests ─────────────────────────────────────────

  @IsTest
  static void picklist_getDefaultValue_returns_none() {
    TableBuddyConfigPicklist picklist = new TableBuddyConfigPicklist();
    Test.startTest();
    VisualEditor.DataRow defaultRow = picklist.getDefaultValue();
    Test.stopTest();
    System.assertEquals('-- None --', defaultRow.getLabel());
    System.assertEquals('', defaultRow.getValue());
  }

  @IsTest
  static void picklist_getValues_includes_saved_configs() {
    TableBuddyConfigPicklist picklist = new TableBuddyConfigPicklist();
    Test.startTest();
    VisualEditor.DynamicPickListRows rows = picklist.getValues();
    Test.stopTest();
    System.assert(
      rows.size() >= 2,
      'Expected at least 2 rows (None + test config)'
    );
  }

  // ── Aggregate Query Tests ──────────────────────────────────

  @IsTest
  static void getTableCache_handles_aggregate_query() {
    Account testAcc = new Account(Name = 'Agg Test', Industry = 'Technology');
    insert testAcc;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{
        'queryString' => 'SELECT Industry, COUNT(Id) cnt FROM Account GROUP BY Industry'
      }
    );
    Test.stopTest();
    System.assertNotEquals(null, result.get('tableData'));
  }

  // ── Date Column Type Tests ─────────────────────────────────

  @IsTest
  static void getTableCache_generates_date_column_type() {
    Opportunity opp = new Opportunity(
      Name = 'Date Test',
      CloseDate = Date.today(),
      StageName = 'Prospecting'
    );
    insert opp;
    Test.startTest();
    Map<String, Object> result = TableBuddyService.getTableCache(
      new Map<String, Object>{
        'queryString' => 'SELECT Id, CloseDate FROM Opportunity LIMIT 1'
      }
    );
    Test.stopTest();
    List<Map<String, Object>> columns = (List<Map<String, Object>>) result.get(
      'tableColumns'
    );
    Boolean foundDateLocal = false;
    for (Map<String, Object> col : columns) {
      if (col.get('type') == 'date-local') {
        foundDateLocal = true;
      }
    }
    System.assert(foundDateLocal, 'Expected date-local type for CloseDate');
  }
}
