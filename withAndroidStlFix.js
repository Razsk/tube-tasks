const { withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins');

const withAndroidStlFix = (config) => {
  config = withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('DANDROID_STL=c++_shared')) {
      config.modResults.contents += `\n
subprojects {
  afterEvaluate { subproject ->
    if (subproject.plugins.hasPlugin('com.android.library') || subproject.plugins.hasPlugin('com.android.application')) {
      subproject.android {
        defaultConfig {
          externalNativeBuild {
            cmake {
              arguments "-DANDROID_STL=c++_shared"
            }
          }
        }
      }
    }
  }
}
`;
    }
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('DANDROID_STL=c++_shared')) {
      config.modResults.contents = config.modResults.contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "-DANDROID_STL=c++_shared"
            }
        }`
      );
    }
    return config;
  });

  return config;
};

module.exports = withAndroidStlFix;
