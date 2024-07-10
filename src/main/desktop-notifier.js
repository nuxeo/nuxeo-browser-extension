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
    // Check if options has an imageUrl property
    const type = options.imageUrl ? 'image' : 'basic';

    // Ensure options.type is set to 'basic' or 'image' depending on whether options has an imageUrl property
    options = {
      type,
      requireInteraction: false,
      iconUrl: '../images/nuxeo-128.png',
      ...options
    };

    return new Promise((resolve, reject) => {
      chrome.notifications.create(namespacedIdOf(id), options, (notificationId) => {
        if (chrome.runtime.lastError) {
	  // log the error
          console.groupCollapsed('Notification Error');
          console.warn('Failed to create notification');
          console.error(chrome.runtime.lastError);
          console.info('Notification ID:', notificationId);
          console.info('Options:', options);
          console.groupEnd();

          const error = new Error('Failed to create notification');
          error.cause = chrome.runtime.lastError;
          error.info = { id: notificationId, options };
          return reject(error);
        }

	// always log the notification
        console.groupCollapsed('Created notification');
        console.info('Notification ID:', notificationId);
        console.info('Options:', options);
        console.groupEnd();

	// resolve if no acknowledge required
        if (!options.requireInteraction) {
          return resolve(notificationId); 
        }

	// wait for user acknowledge
        const resolveIfMatchingId = (clickedId) => {
          if (clickedId !== notificationId) return;
          resolve(notificationId);
        };
        chrome.notifications.onClicked.addListener(resolveIfMatching)

        // let's the caller informed of the asynch condition
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
