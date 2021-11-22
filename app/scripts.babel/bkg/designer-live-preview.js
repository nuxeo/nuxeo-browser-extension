/*
Copyright 2016-2020 Nuxeo

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

let userCookies = "";
let redirectedUrls = {};
let nuxeoBaseUrl = 'http://localhost:8080/nuxeo/';
const storeRedirectedUrlsLocally = (baseUrl, json) => {
  Object.keys(json).forEach((basePath) => {
    const nuxeoInstanceBasePath = basePath.replace(/^\/(nuxeo\.war\/?\/)?/, '');

    const files = Object.keys(json[basePath]);
    if (files.length > 0) {
      files.forEach((resource) => {
        const nuxeoInstanceResource = `${baseUrl}${nuxeoInstanceBasePath}/${resource}`;
        // FIXME Warning this replace should be removed (needs fixing on connect side)
        const connectResource = json[basePath][resource].replace(/http:\/\//, 'https://');

        redirectedUrls[nuxeoInstanceResource] = connectResource;
      });
    }
  });
};

const redirectRequestToConnectIfNeeded = (details) => {
  // Sometimes, URLs contain '//' which would prevent us from finding the url for redirect
  const nuxeoInstanceUrl = details.url.replace(/([^:])\/\/+/g, '$1/');
  const redirectUrl = redirectedUrls[nuxeoInstanceUrl];

  if (!redirectUrl) {
    return {};
  }

  return {
    redirectUrl,
  };
};

const addCookieHeaderForConnectRequest = (details) => {
  const requestHeaders = details.requestHeaders;

  // FIXME: behavior chrome/firefox not equivalent here. Chrome does not seem to send cookies with requests originated from html imports
  const cookieHeader = requestHeaders.filter(h => h.name === 'Cookie');
  if(cookieHeader.length > 0) {
    // Cookies are already set by the browser, we have nothing to do.
    return Promise.resolve({});
  }

  // We need to add cookies as they are stripped by browser
  requestHeaders.push({
    name: 'Cookie',
    value: userCookies,
  })
  return {
    requestHeaders
  }
  // return browser.cookies
  //   .getAll({ domain: CONNECT_DOMAIN })
  //   .then((cookies) => {
  //     const cookieHeader = cookies
  //       .map(x => x.name + '=' + x.value)
  //       .join('; ')
  //
  //     requestHeaders.push({
  //       name: 'Cookie',
  //       value: cookieHeader,
  //     });
  //
  //     return {
  //       requestHeaders,
  //     };
  //   });
};


const addNewResources = (details) => {
  // Detects when Studio users save changes to a new resource in Designer
  if (details.method === 'POST') {
    const resourcePaths = details.requestBody.formData.path;
    return resourcePaths.forEach((resourcePath) => {
      resourcePath = resourcePath.replace(/\/\//, '/');
      const connectResource = `${details.url}${resourcePath}`;
      resourcePath = resourcePath.replace(/^\/(nuxeo\.war\/?\/)?/, '');
      const nuxeoResource = `${nuxeoBaseUrl}${resourcePath}`;
      // If there is no redirected URL to the customized resource yet, add one
      if (!(nuxeoResource in redirectedUrls)) {
        redirectedUrls[nuxeoResource] = connectResource;
        console.log(`New resource added: ${resourcePath}`);
      }
    });
  }
}

const revertToDefault = (details) => {
  // Detects when Studio users revert their customizations to default
  if (details.method === 'DELETE') {
    const key = Object.keys(redirectedUrls).find(key => redirectedUrls[key] === details.url);
    // Removes redirected URLs to reverted customizations to avoid 404 in Web UI on refresh
    if (key) {
      delete redirectedUrls[key];
      console.log(`Reverted to default: ${key}`);
    }
  }
};



const enable = (projectName, nuxeoInstanceBaseUrl) => {
  // URL's port is not allowed in urlPattern, thus had to be removed.
  nuxeoBaseUrl = nuxeoInstanceBaseUrl;
  const urlPattern = `${nuxeoInstanceBaseUrl.replace(/:\d+/, '')}*`;

  browser.cookies
    .getAll({ domain: CONNECT_DOMAIN })
    .then((cookies) => {
      const cookieHeader = cookies
        .map(x => x.name + '=' + x.value)
        .join('; ');
      userCookies = cookieHeader;
    })

  browser.webRequest.onBeforeRequest.addListener(redirectRequestToConnectIfNeeded, {
    urls: [urlPattern],
  }, ['blocking']);

  browser.webRequest.onBeforeRequest.addListener(addNewResources, {
    urls: [`${CONNECT_URL}/nuxeo/site/studio/v2/project/${projectName}/workspace/ws.resources`],
  }, ['requestBody']);

  let extraInfoSpec = ['blocking', 'requestHeaders']
  if (browser.webRequest.OnBeforeSendHeadersOptions.hasOwnProperty('EXTRA_HEADERS')) {
    extraInfoSpec.push('extraHeaders');
  }
  // https://groups.google.com/a/chromium.org/g/chromium-extensions/c/vYIaeezZwfQ
  browser.webRequest.onBeforeSendHeaders.addListener(addCookieHeaderForConnectRequest, {
    urls: [`${CONNECT_URL}/*`],
  }, extraInfoSpec);

  browser.webRequest.onCompleted.addListener(revertToDefault, {
    urls: [`${CONNECT_URL}/*`],
  }, ['responseHeaders']);

  // fetch available resources from Studio Project
  return fetch(`${CONNECT_URL}/nuxeo/site/studio/v2/project/${projectName}/workspace/ws.resources`, {
    credentials: 'include',
  }).then((response) => {
    if (response.ok) {
      return response.json()
        .then((json) => {
          storeRedirectedUrlsLocally(nuxeoInstanceBaseUrl, json);
          console.log(`Enabled Designer Live Preview for ${nuxeoInstanceBaseUrl}`);
        });
    }
    throw new Error('Not logged in to connect.');
  })
};


const disable = () => new Promise((resolve, reject) => {
  console.log('Disabling Designer Live Preview');
  browser.webRequest.onBeforeRequest.removeListener(redirectRequestToConnectIfNeeded);
  browser.webRequest.onBeforeRequest.removeListener(revertToDefault);
  browser.webRequest.onBeforeSendHeaders.removeListener(addCookieHeaderForConnectRequest);
  browser.webRequest.onCompleted.removeListener(addNewResources);
  redirectedUrls = {};
  resolve();
});

const isEnabled = () => {
  return Object.keys(redirectedUrls).length !== 0;
}

window.CONNECT_URL = CONNECT_URL;
window.designerLivePreview = {
  enable,
  disable,
  isEnabled,
  redirectedUrls,
};
