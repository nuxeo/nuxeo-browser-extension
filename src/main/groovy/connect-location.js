export default function connectLocation() {
  return `
    import org.nuxeo.ecm.core.api.Blobs
    import org.nuxeo.ecm.core.io.registry.MarshallerHelper
    import org.nuxeo.ecm.core.io.registry.context.RenderingContext
    import org.nuxeo.connect.connector.http.ConnectUrlConfig
  
    def output = new URL(ConnectUrlConfig.getBaseUrl())

    println Blobs.createJSONBlobFromValue(output).getString()
  `;
}
