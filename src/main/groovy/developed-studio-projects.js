export default function developedStudioProjects(login = '', token = '') {
  return `
    import org.nuxeo.ecm.core.api.Blobs
    import org.nuxeo.ecm.core.io.registry.MarshallerHelper
    import org.nuxeo.ecm.core.io.registry.context.RenderingContext
    import org.apache.commons.logging.Log
    import org.apache.commons.logging.LogFactory
    import org.nuxeo.connect.client.we.StudioSnapshotHelper
    import org.nuxeo.connect.packages.PackageManager
    import org.nuxeo.connect.registration.RegistrationHelper
    import org.nuxeo.connect.update.PackageType
    import org.nuxeo.connect.update.Package
    import org.nuxeo.runtime.api.Framework
    import org.nuxeo.connect.data.ConnectProject

    PackageManager packages = Framework.getService(PackageManager.class);
    RegistrationHelper registrations = new RegistrationHelper();

    Package registeredPackage = StudioSnapshotHelper.getSnapshot(packages.listRemoteAssociatedStudioPackages())

    Set<String> packageNames = new HashSet<>();
    packageNames.addAll(packages.listInstalledPackagesNames(PackageType.STUDIO));

    Set<String> developedPackages = new HashSet<>();
    if (registeredPackage != null) {
      developedPackages.add(registeredPackage.name);
    }
    if ('${login}' != null && '${login}'.trim() != '') {
      developedPackages.addAll(registrations.getAvailableProjectsForRegistration('${login}', '${token}').collect { it.symbolicName });
    }
    packageNames.retainAll(developedPackages);

    // compute packages JSON output
    List<Map> projectsOutput = packageNames.collect { packageName ->
      [
        packageName: packageName,
        isRegistered: (registeredPackage != null && packageName == registeredPackage.name) || false
      ]
    };

    // compute the final output
    boolean developmentMode = Framework.isDevModeSet();

    Map output = [
      projects: projectsOutput,
      developmentMode: developmentMode
    ];

    println Blobs.createJSONBlobFromValue(output).getString()
  `;
}
