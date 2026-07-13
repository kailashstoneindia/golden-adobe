const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

/** Keep automatic signing enabled after `expo prebuild --clean`. */
function withIosAutoSigning(config) {
  return withXcodeProject(config, (cfg) => {
    const teamId = cfg.ios?.appleTeamId;
    if (!teamId) {
      return cfg;
    }

    const project = cfg.modResults;

    for (const [nativeTargetId, nativeTarget] of IOSConfig.Target.findSignableTargets(project)) {
      IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
        project,
        nativeTarget.buildConfigurationList,
      )
        .filter(([, item]) => item.buildSettings?.PRODUCT_NAME)
        .forEach(([, item]) => {
          item.buildSettings.DEVELOPMENT_TEAM = teamId;
          item.buildSettings.CODE_SIGN_IDENTITY = '"Apple Development"';
          item.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        });

      Object.entries(IOSConfig.XcodeUtils.getProjectSection(project))
        .filter(IOSConfig.XcodeUtils.isNotComment)
        .forEach(([, item]) => {
          if (!item.attributes.TargetAttributes) {
            item.attributes.TargetAttributes = {};
          }

          if (!item.attributes.TargetAttributes[nativeTargetId]) {
            item.attributes.TargetAttributes[nativeTargetId] = {};
          }

          item.attributes.TargetAttributes[nativeTargetId].DevelopmentTeam = teamId;
          item.attributes.TargetAttributes[nativeTargetId].ProvisioningStyle = 'Automatic';
        });
    }

    return cfg;
  });
}

module.exports = withIosAutoSigning;
