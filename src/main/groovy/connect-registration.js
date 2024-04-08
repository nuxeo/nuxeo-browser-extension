export default function connectRegistration() {
  return `
    import org.apache.commons.logging.Log
    import org.apache.commons.logging.LogFactory
    import groovy.json.JsonOutput
    import org.nuxeo.connect.client.we.StudioSnapshotHelper
    import org.nuxeo.connect.connector.CanNotReachConnectServer
    import org.nuxeo.connect.connector.http.ConnectUrlConfig
    import org.nuxeo.connect.data.SubscriptionStatus
    import org.nuxeo.connect.data.SubscriptionStatusType
    import org.nuxeo.connect.identity.LogicalInstanceIdentifier
    import org.nuxeo.connect.packages.PackageManager
    import org.nuxeo.connect.packages.dependencies.TargetPlatformFilterHelper
    import org.nuxeo.connect.platform.PlatformId
    import org.nuxeo.connect.registration.ConnectRegistrationService
    import org.nuxeo.connect.update.Package
    import org.nuxeo.connect.update.PackageDependency
    import org.nuxeo.ecm.admin.runtime.PlatformVersionHelper
    import org.nuxeo.runtime.api.Framework

    Log log = LogFactory.getLog(this.class)

    def packageOf(snapshotPackage) {
      if (snapshotPackage == null) {
        return null
      }
      return [
        name: snapshotPackage.name,
        studioDistrib: snapshotPackage.targetPlatforms,
        deps: snapshotPackage.dependencies,
      ]
    }

    def isMatching(snapshotPackage, nxInstance) {
      if (snapshotPackage == null) {
        return false
      }
      return snapshotPackage.targetPlatforms.any { it == nxInstance.asString() }
    }

    def connectSubscriptionOf(gateway) {
      try {
        return gateway.getConnector().getConnectStatus()
      } catch (Exception cause) {
        SubscriptionStatus errorStatus = new SubscriptionStatus()
        errorStatus.setErrorMessage(JsonOutput.toJson([message: cause.message, type: cause.getClass().getName()]))
        errorStatus.setContractStatus(SubscriptionStatusType.UNKNOWN.getValue())
        return errorStatus;
      }
    }

    ConnectRegistrationService gateway = Framework.getService(ConnectRegistrationService.class)
    String connectUrl = ConnectUrlConfig.getBaseUrl()
    LogicalInstanceIdentifier clid = gateway.getCLID()
    SubscriptionStatus connectSubscription = connectSubscriptionOf(gateway)
    PackageManager packages = Framework.getService(PackageManager.class)
    Package snapshotPackage = StudioSnapshotHelper.getSnapshot(packages.listRemoteAssociatedStudioPackages())

    def nxInstance = PlatformVersionHelper.getPlatformId()
    def studioPackage = packageOf(snapshotPackage)
    def output = [
      nx: nxInstance.asString(),
      clid: clid,
      connectUrl: connectUrl,
      connectSubscription: connectSubscription,
      developmentMode: Framework.isDevModeSet(),
      match: isMatching(snapshotPackage, nxInstance),
      package: studioPackage,
    ]

    println JsonOutput.toJson(output)
  `;
}
