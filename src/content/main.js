/* eslint-disable comma-dangle */
/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
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

import ServiceWorkerBridge from '../service-worker-bridge';

class Content {
  constructor(store) {
    this.browserStore = store;

    // fetch back the server url from the browser store
    this.browserStore.get(['server']).then((data) => {
      this.server = data.server;
    });
  }
}

class ContentMessageHandler {
  constructor(content) {
    this.content = content;
  }

  handle(request, sender, sendResponse) {
    if (request.extension !== 'nuxeo-web-extension') {
      return undefined;
    }
    const service = this.content[request.service];
    if (request.service !== 'content') {
      return undefined;
    }
    if (typeof service[request.action] !== 'function') {
      sendResponse({ error: 'Invalid action' });
      return false;
    }
    Promise.resolve(service[request.action](...request.params))
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ error: error.toString() });
      });
    return true;
  }
}

new ServiceWorkerBridge()
  .bootstrap({
    name: 'content',
    entrypoint: () => { console.warn('Loading content script'); }
  })
  .then((worker) => {
    const content = new Content(worker.browserStore);
    const handler = new ContentMessageHandler(content);

    chrome.runtime.onMessage
      .addListener((request, sender, sendResponse) => handler.handle(request, sender, sendResponse));
  });
