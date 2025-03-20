export default function getInstalledAddons() {
  return `
    import org.nuxeo.ecm.core.api.Blobs
    import org.nuxeo.ecm.core.io.registry.MarshallerHelper
    import org.nuxeo.ecm.core.io.registry.context.RenderingContext
    import org.nuxeo.connect.packages.PackageManager
    import org.nuxeo.runtime.api.Framework
    
    PackageManager pm = Framework.getService(PackageManager)
    String[] addons = pm.listInstalledPackagesNames()
    
    println Blobs.createJSONBlobFromValue(addons).getString()
`;
}
