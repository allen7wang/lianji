const { withPodfile, withXcodeProject } = require('expo/config-plugins');

// Expo 57's Constants shell wrapper splits paths containing spaces. Keep the
// upstream Node generator and environment helper, and quote their arguments.
const marker = '# lianji: quoted Constants build paths';
const hook = String.raw`
    ${marker}
    installer.pods_project.targets.each do |target|
      target.shell_script_build_phases.each do |phase|
        next unless phase.name == '[CP-User] Generate app.config for prebuilt Constants.manifest'
        phase.shell_script = <<~'LIANJI_CONSTANTS_SCRIPT'
          set -eo pipefail
          if [ -z "$PROJECT_ROOT" ]; then
            PROJECT_ROOT="$PROJECT_DIR/../.."
          fi
          RESOURCE_DEST="$CONFIGURATION_BUILD_DIR/EXConstants.bundle"
          if [ "$BUNDLE_FORMAT" = "deep" ]; then
            RESOURCE_DEST="$RESOURCE_DEST/Contents/Resources"
          fi
          mkdir -p "$RESOURCE_DEST"
          bash -l "$PODS_TARGET_SRCROOT/../scripts/with-node.sh" "$PODS_TARGET_SRCROOT/../scripts/getAppConfig.js" "$PROJECT_ROOT" "$RESOURCE_DEST"
        LIANJI_CONSTANTS_SCRIPT
      end
    end
`;

module.exports = function withIosConstants(config) {
  config = withPodfile(config, mod => {
    const contents = mod.modResults.contents;
    if (contents.includes(marker)) return mod;
    const anchor = 'post_install do |installer|';
    if (!contents.includes(anchor)) throw new Error('Cannot apply the Constants path fix: iOS post_install hook is missing.');
    mod.modResults.contents = contents.replace(anchor, anchor + hook);
    return mod;
  });
  return withXcodeProject(config, mod => {
    const resolver = String.raw`"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"`;
    const original = '`' + resolver + '`';
    const quoted = '"$(' + resolver + ')"';
    const phases = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    for (const phase of Object.values(phases)) {
      if (typeof phase !== 'object' || !phase.name?.includes('Bundle React Native code and images')) continue;
      const script = JSON.parse(phase.shellScript);
      if (script.includes(quoted)) continue;
      if (!script.includes(original)) throw new Error('Cannot quote the iOS bundle script: the Expo template has changed.');
      phase.shellScript = JSON.stringify(script.replace(original, quoted));
    }
    return mod;
  });
};
