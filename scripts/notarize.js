require("dotenv").config();
const { notarize } = require("@mistweaverco/electron-notarize-async");

function canSignAndNotarize() {
  return Boolean(
    process.env.CSC_LINK &&
      process.env.CSC_KEY_PASSWORD &&
      process.env.APPLE_ID &&
      process.env.APPLE_APP_SPECIFIC_PASSWORD &&
      process.env.APPLE_TEAM_ID,
  );
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  if (!canSignAndNotarize()) {
    console.log("Skipping notarization: code signing credentials are not configured");
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    tool: "notarytool",
    teamId: process.env.APPLE_TEAM_ID,
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    webhook: process.env.APPLE_NOTARIZATION_WEBHOOK_URL,
  });
};
