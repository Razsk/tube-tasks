const { withProjectBuildGradle } = require('@expo/config-plugins');

const withAndroidStlFix = (config) => {
  return withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('DANDROID_STL=c++_shared')) {
      const stlSnippet = `
allprojects {
  tasks.withType(org.gradle.api.tasks.compile.JavaCompile).configureEach {
    options.compilerArgs << "-Xlint:unchecked"
  }
}

subprojects {
  plugins.withId('com.android.library') {
    android {
      defaultConfig {
        externalNativeBuild {
          cmake {
            arguments "-DANDROID_STL=c++_shared"
          }
        }
      }
    }
  }
  plugins.withId('com.android.application') {
    android {
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
`;
      config.modResults.contents += stlSnippet;
    }
    return config;
  });
};

module.exports = withAndroidStlFix;
