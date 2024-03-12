/* eslint-disable function-paren-newline */
/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable max-classes-per-file */
/* eslint-disable comma-dangle */
/*
Copyright 2016-2024 Nuxeo

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

import DeclarativeNetComponents from './declarative-net-engine';

const RedirectRule = DeclarativeNetComponents.RedirectRule;

class DesignerLivePreview {
  // eslint-disable-next-line no-unused-vars
  constructor(worker) {
    this.worker = worker;

    // Set defaukt properties for the class
    this.cleanupFunctions = [];

    // Bind methods
    this.addNewRedirectionsOf = this.addNewRedirectionsOf.bind(this);
    this.disable = this.disable.bind(this);
    this.enable = this.enable.bind(this);
    this.toggle = this.toggle.bind(this);
    this.isEnabled = this.isEnabled.bind(this);
  }

  pushRedirectionsOf(rootUrl, json) {
    Object.keys(json).forEach((basePath) => {
      const nuxeoInstanceBasePath = basePath.replace(
        /^\/(nuxeo\.war\/?\/)?/,
        ''
      );

      const files = Object.keys(json[basePath]);
      files.forEach((resource) => {
        const connectResource = json[basePath][resource];
        const nuxeoInstanceResource = `${rootUrl}/${nuxeoInstanceBasePath}/${resource}`;
        this.worker.declarativeNetEngine.push(new RedirectRule(nuxeoInstanceResource, connectResource));
      });
    });
  }

  addNewRedirectionsOf(details) {
    // Detects when Studio users save changes to a new resource in Designer
    if (details.method !== 'POST') {
      return;
    }
    const resourcePaths = details.requestBody.formData.path;
    resourcePaths.forEach((resourcePath) => {
      resourcePath = resourcePath.replace(/\/\//, '/');
      const connectResource = `${details.url}${resourcePath}`;
      resourcePath = resourcePath.replace(/^\/(nuxeo\.war\/?\/)?/, '');
      const nuxeoResource = `${this.nuxeo.baseUrl}${resourcePath}`;
      this.worker.declarativeNetEngine.push(new RedirectRule(nuxeoResource, connectResource));
    });
    this.worker.declarativeNetEngine.flush().catch((error) => {
      console.error('Failed to add new redirection rules:', error);
    });
  }

  removeRedirectionsOf(details) {
    // Detects when Studio users revert their customizations to default
    if (details.method !== 'DELETE') {
      return;
    }
    this.worker.declarativeNetEngine.pop(details.url);
    this.worker.declarativeNetEngine.flush().catch((error) => {
      console.error('Failed to remove redirection rules:', error);
    });
  }

  toggle(projectName) {
    return this.isEnabled()
      .then((enabled) => {
        if (enabled) {
          return this.disable(projectName);
        } else {
          return this.enable(projectName);
        }
      });
  }

  enable(projectName) {
    const rulesPusher = (connectUrl, nuxeoUrl) =>
      Promise.resolve(true)
      // chrome.cookies
      //   .getAll({ domain: connectUrl.hostname })
      //   .then((cookies) =>
      //     cookies.map((x) => `${x.name}=${x.value}`).join('; ')
      //   )
      //   .then((cookieHeader) => {
      //     this.worker.declarativeNetEngine.push(new CookieHeaderRule(connectUrl, cookieHeader));
      //   })
        .then(
          () =>
            new URL(
              `/nuxeo/site/studio/v2/project/${projectName}/workspace/ws.resources`,
              connectUrl
            )
        )
        .then((workspaceUrl) =>
          fetch(
            // fetch connect workspace to get redirected URLs
            workspaceUrl,
            {
              credentials: 'include',
            }
          )
            .then((response) => {
              // Check if the request was successful
              if (!response.ok) {
                // If the status code is 401, the user is not authenticated
                if (response.status === 401) {
                  throw new Error('Not authenticated.');
                }

                // If the status code is anything else, there was another type of error
                throw new Error(`Request failed with status ${response.status}`);
              }

              // Check if a redirect occurred
              if (response.url.toString() !== workspaceUrl.toString()) {
                throw new Error(`Redirected from ${workspaceUrl} to ${response.url}, possibly due to not being authenticated.`);
              }

              const contentType = response.headers.get('content-type');
              if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Unexpected content type');
              }
              return response.json();
            })
            .then((jsonData) => this.pushRedirectionsOf(nuxeoUrl, jsonData))
            .then(() => workspaceUrl)
        )
        .then((workspaceUrl) => this.worker.declarativeNetEngine.flush().then(() => [
          connectUrl.toString(),
          workspaceUrl.toString(),
          nuxeoUrl,
        ]));

    return Promise
      .all([
        this.disable(), // Ensure we don't have multiple listeners
        this.worker.connectLocator // Retrieve workspace location
          .url()
          .then((connectUrl) =>
            rulesPusher(connectUrl, this.worker.serverConnector.rootUrl)
          ),
      ])
      // eslint-disable-next-line no-unused-vars
      .then(([_, [connectLocation, workspaceLocation, nuxeoLocation]]) => [
        connectLocation,
        workspaceLocation,
        nuxeoLocation,
      ])
      .then(([connectLocation, workspaceLocation, nuxeoLocation]) => {
        chrome.webRequest.onBeforeRequest.addListener(
          (details) => this.addNewRedirectionsOf(details),
          {
            urls: [workspaceLocation],
          },
          ['requestBody']
        );
        this.cleanupFunctions.push(() =>
          chrome.webRequest.onBeforeRequest.removeListener(
            this.addNewResources
          )
        );
        return [connectLocation, workspaceLocation, nuxeoLocation];
      })
      .then(([connectLocation, workspaceLocation, nuxeoLocation]) => {
        chrome.webRequest.onCompleted.addListener(
          this.removeRedirectionsOf,
          {
            urls: [`${connectLocation}/*`],
          },
          ['responseHeaders']
        );
        this.cleanupFunctions.push(() => chrome
          .webRequest
          .onCompleted
          .removeListener(this.revertToDefault));
        return [connectLocation, workspaceLocation, nuxeoLocation];
      })
      .then(() => this.cleanupFunctions.push(() => this.worker.declarativeNetEngine.clear()))
      .then(() => true);
  }

  // eslint-disable-next-line no-unused-vars
  disable(projectName) {
    return Promise.resolve()
      .then(() => {
        while (this.cleanupFunctions.length > 0) {
          const cleanupFunction = this.cleanupFunctions.pop();
          cleanupFunction();
        }
      })
      .then(() => false);
  }

  isEnabled() {
    return Promise.resolve(this.cleanupFunctions.length > 0);
  }
}

export default DesignerLivePreview;
