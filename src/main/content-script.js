(async () => {
  let connected;

  try {
    const response = await fetch('/nuxeo/json/cmis');
    // Some pages can return an HTML page with 404 message on it.
    // We should validate that the response is a json object.
    await response.json();
    connected = response.ok;
  } catch (error) {
    connected = false;
  }

  if (!connected) {
    await chrome.runtime.sendMessage({
      extension: 'nuxeo-web-extension',
      component: 'serverConnector',
      action: 'disconnect',
      params: []
    });
  }
})();