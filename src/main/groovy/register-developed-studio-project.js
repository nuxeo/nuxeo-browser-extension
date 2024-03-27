export default function registerDevelopedStudioProject(login = '', token = '', projectName = '', clid = '') {
  return `
    import groovy.json.JsonOutput
    import org.nuxeo.connect.connector.NuxeoClientInstanceType
    import org.nuxeo.connect.identity.LogicalInstanceIdentifier
    import org.nuxeo.connect.registration.RegistrationException
    import org.nuxeo.connect.registration.RegistrationHelper
    import org.nuxeo.connect.registration.ConnectRegistrationService
    import org.nuxeo.runtime.api.Framework

    ConnectRegistrationService registrations = Framework.getService(ConnectRegistrationService.class)
    String description = "nuxeo web extension registration"
    if ("${clid}".trim() != "") {
      registrations.localRegisterInstance("${clid}", description)
      registrations.getConnector() // force re-cpnnecting
    } else {
      registrations.remoteRegisterInstance("${login}", "${token}", "${projectName}", NuxeoClientInstanceType.DEV,  "nuxeo web extension registration")
    }
    LogicalInstanceIdentifier clid = registrations.getCLID()

    println JsonOutput.toJson(clid)
  `;
}
