/*
Copyright 2016-2022 Nuxeo

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/* global DOMPurify */

let tabUrl;
let docUrl;

function pageActionOnNuxeo(tabInfo) {
  const re = /.*\.nuxeo$/;
  const login = '/login.jsp';
  tabUrl = tabInfo.url;
  chrome.cookies.getAll({
    url: tabUrl,
    name: 'JSESSIONID',
  }, (cookies) => {
    chrome.action.hide(tabInfo.id);
    cookies.forEach((cookie) => {
      if ((cookie.value).match(re) && ((tabUrl).indexOf(login) < 0)) {
        chrome.action.show(tabInfo.id);
      }
    });
  });
}

function disableExt(tabInfo) {
  chrome.action.hide(tabInfo.id);
}

function getInfoForTab(tabs) {
  if (tabs.length > 0) {
    chrome.tabs.get(tabs[0].id, pageActionOnNuxeo);
  }
}

function getTabToDisable(tabs) {
  if (tabs.length > 0) {
    chrome.tabs.get(tabs[0].id, disableExt);
  }
}

function onChange() {
  chrome.tabs.query({ lastFocusedWindow: true, active: true }, getInfoForTab);
}

function disableTabExtension() { // eslint-disable-line no-unused-vars
  chrome.tabs.query({ lastFocusedWindow: true, active: true }, getTabToDisable);
}

const target = '<all_urls>';
chrome.webRequest.onCompleted.addListener(onChange, { urls: [target] });
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, pageActionOnNuxeo);
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pathPattern = /^\//;
const webuiPattern = /nuxeo\/ui\/#!\//;

function createTabs(url, tabId) {
  chrome.tabs.query({
    active: true,
  }, (tabs) => {
    const index = tabs[0].index;
    chrome.tabs.create({
      url,
      openerTabId: tabId,
      selected: false,
      index: index + 1,
    });
  });
}

function openDocFromId(id, url) {
  const onWebUI = webuiPattern.exec(tabUrl);
  nuxeo.request(`/id/${id}`)
    .schemas('*')
    .enrichers({ document: ['acls', 'permissions'] })
    .get()
    .then((doc) => {
      if (onWebUI) {
        docUrl = url.concat(`ui/#!/doc/${doc.uid}`);
      } else {
        docUrl = url.concat(`nxdoc/default/${doc.uid}/view_documents`);
      }
      createTabs(docUrl, studioExt.server.tabId);
    })
    .catch((error) => {
      console.log(error);
    });
}

function openDocFromPath(path, url) {
  const onWebUI = webuiPattern.exec(tabUrl);
  nuxeo.request(`/path/${path}`)
    .schemas('*')
    .enrichers({ document: ['acls', 'permissions'] })
    .get()
    .then((doc) => {
      if (onWebUI) {
        docUrl = url.concat(`ui/#!/doc/${doc.uid}`);
      } else {
        docUrl = url.concat(`nxdoc/default/${doc.uid}/view_documents`);
      }
      createTabs(docUrl, studioExt.server.tabId);
    })
    .catch((error) => {
      console.log(error);
    });
}

chrome.omnibox.onInputChanged.addListener(
  (text, suggest) => {
    getCurrentTabUrl((url) => {
      nuxeo = new Nuxeo({
        baseURL: url,
      });
      if (((text.toUpperCase()).indexOf('SELECT ') !== -1) && ((text.toUpperCase()).indexOf(' FROM ') !== -1)) {
        const query = text.replace(/'/g, '"');
        const suggestions = [];
        nuxeo.repository()
          .schemas(['dublincore', 'common', 'uid'])
          .query({
            query,
            sortBy: 'dc:modified',
          })
          .then((res) => {
            if ((res.entries).length > 0) {
              (res.entries).forEach((doc) => {
                suggestions.push({
                  content: doc.uid,
                  description: DOMPurify.sanitize(`<match>${doc.title}</match> <dim>${doc.path}</dim>`, { ALLOWED_TAGS: ['match', 'dim'] }),
                });
              });
            }
            if ((res.entries).length > 5) {
              chrome.omnibox.setDefaultSuggestion({
                description: DOMPurify.sanitize('<dim>Want more results? Try the</dim> <match>fulltext searchbox</match> <dim>from the Nuxeo Dev Tools extension window.</dim>', { ALLOWED_TAGS: ['match', 'dim'] }),
              });
            }
            suggest(suggestions);
          });
      } else if (uuidPattern.test(text)) {
        openDocFromId(text, url);
      } else if (pathPattern.test(text)) {
        openDocFromPath(text, url);
      } else {
        const jsonQuery = `SELECT * FROM Document WHERE ecm:fulltext = "${text}"`;
        const query = jsonQuery.replace(/'/g, '"');
        const suggestions = [];
        nuxeo.repository()
          .schemas(['dublincore', 'common', 'uid'])
          .query({
            query,
            sortBy: 'dc:modified',
          })
          .then((res) => {
            if ((res.entries).length > 0) {
              (res.entries).forEach((doc) => {
                suggestions.push({
                  content: doc.uid,
                  description: DOMPurify.sanitize(`<match>${doc.title}</match> <dim>${doc.path}</dim>`, { ALLOWED_TAGS: ['match', 'dim'] }),
                });
              });
            }
            if ((res.entries).length > 5) {
              chrome.omnibox.setDefaultSuggestion({
                description: DOMPurify.sanitize('<dim>Want more results? Try the</dim> <match>fulltext searchbox</match> <dim>from the Nuxeo Dev Tools extension window.</dim>', { ALLOWED_TAGS: ['match', 'dim'] }),
              });
            }
            suggest(suggestions);
          });
      }
    });
  },
);

chrome.omnibox.onInputEntered.addListener(
  (text) => {
    getCurrentTabUrl((url) => {
      nuxeo = new Nuxeo({
        baseURL: url,
      });
      if (uuidPattern.test(text)) {
        openDocFromId(text, url);
      } else if (pathPattern.test(text)) {
        openDocFromPath(text, url);
      }
    });
  },
);
