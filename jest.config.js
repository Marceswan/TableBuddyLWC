const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");
module.exports = {
  ...jestConfig,
  moduleNameMapper: {
    "^c/tableBuddyFuse$":
      "<rootDir>/force-app/main/default/lwc/tableBuddyFuse/tableBuddyFuse.js"
  }
};
