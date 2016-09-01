function pageActionOnNuxeo(tabInfo) {
  var re = /https?:\/\/[\w\:\.]+\/\w+\/(?:nxdoc|nxpath|nxsearch|nxadmin|nxhome|nxdam|nxdamid|site\/\w+)\/\w+/g;
  var currentUrl = tabInfo.url;
  var isNuxeo = currentUrl.match(re);
  if (isNuxeo){
    chrome.pageAction.show(tabInfo.id);
  };
};

function getInfoForTab(tabs) {
  if (tabs.length > 0) {
    chrome.tabs.get(tabs[0].id, pageActionOnNuxeo);
  }
}

function onChange(tabInfo) {
  chrome.tabs.query({currentWindow: true, active: true}, getInfoForTab);
};

var target = "<all_urls>";
chrome.webRequest.onCompleted.addListener(onChange, {urls: [target]});

