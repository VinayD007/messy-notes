const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Ensures Android Gradle variants output the APK binary as MessyNotes.apk
 * across clean prebuilds.
 */
module.exports = function withMessyNotesApkName(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes('outputFileName = "MessyNotes.apk"')) {
      return mod;
    }

    const snippet = `
    applicationVariants.all { variant ->
        variant.outputs.all { output ->
            outputFileName = "MessyNotes.apk"
        }
    }
`;

    mod.modResults.contents = mod.modResults.contents.replace(
      /(\n\s*androidResources\s*\{[\s\S]*?\n\s*\})/,
      `$1\n${snippet}`
    );

    return mod;
  });
};
