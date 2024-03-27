export default function registedStudioProject() {
  return `
    import org.apache.commons.logging.Log
    import org.apache.commons.logging.LogFactory
    import groovy.json.JsonOutput
    import org.nuxeo.connect.client.we.StudioSnapshotHelper
    import org.nuxeo.connect.connector.http.ConnectUrlConfig
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

    ConnectRegistrationService registrations = Framework.getService(ConnectRegistrationService.class)
    String connectUrl = ConnectUrlConfig.getBaseUrl()
    LogicalInstanceIdentifier clid = registrations.getCLID()
    PackageManager packages = Framework.getService(PackageManager.class)
    Package snapshotPackage = StudioSnapshotHelper.getSnapshot(packages.listRemoteAssociatedStudioPackages())

    def nxInstance = PlatformVersionHelper.getPlatformId()
    def studioPackage = packageOf(snapshotPackage)
    def output = [
      nx: nxInstance.asString(),
      clid: clid,
      connectUrl: connectUrl,
      match: TargetPlatformFilterHelper.isCompatibleWithTargetPlatform(snapshotPackage, nxInstance),
      package: studioPackage,
    ]

    println JsonOutput.toJson(output)
  `;
}
