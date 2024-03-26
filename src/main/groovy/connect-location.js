export default function connectLocation() {
  return `
    import groovy.json.JsonOutput
    import org.nuxeo.connect.connector.http.ConnectUrlConfig
  
    def output = new URL(ConnectUrlConfig.getBaseUrl())

    println JsonOutput.toJson(output)
  `;
}
