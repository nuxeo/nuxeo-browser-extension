export default function getInstalledAddons() {
  return `
    import groovy.json.JsonOutput
    import org.nuxeo.connect.packages.PackageManager
    import org.nuxeo.runtime.api.Framework
    
    PackageManager pm = Framework.getService(PackageManager)
    String[] addons = pm.listInstalledPackagesNames()
    
    println JsonOutput.toJson(addons)
`;
}
