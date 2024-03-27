/* eslint-disable class-methods-use-this */
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

import ServiceWorkerComponent from './service-worker-component';

const namespacedIdOf = (id) => `nuxeo-web-extension-${id}`;

class DesktopNotifier extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  notify(id, options) {
    // Ensure options.type is set to 'basic' if not defined
    options = { type: 'basic', ...options };

    return new Promise((resolve, reject) => {
      chrome.notifications.create(namespacedIdOf(id), options, (notificationId) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (!options.requireInteraction) {
          return resolve(notificationId);
        }
        chrome.notifications.onClicked.addListener((clickedId) => {
          if (clickedId === notificationId) {
            resolve(notificationId);
          }
        });
        return undefined;
      });
    });
  }

  cancel(id) {
    return new Promise((resolve, reject) => {
      chrome.notifications.clear(namespacedIdOf(id), (wasCleared) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        return resolve(wasCleared);
      });
    });
  }
}

export default DesktopNotifier;
