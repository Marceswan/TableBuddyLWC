public class TableBuddyConfigPicklist extends VisualEditor.DynamicPickList {
  public override VisualEditor.DataRow getDefaultValue() {
    return new VisualEditor.DataRow('-- None --', '');
  }

  public override VisualEditor.DynamicPickListRows getValues() {
    VisualEditor.DynamicPickListRows rows = new VisualEditor.DynamicPickListRows();
    rows.addRow(new VisualEditor.DataRow('-- None --', ''));
    for (Table_Buddy_Config__c config : [
      SELECT Name
      FROM Table_Buddy_Config__c
      ORDER BY Name ASC
    ]) {
      rows.addRow(new VisualEditor.DataRow(config.Name, config.Name));
    }
    return rows;
  }
}
