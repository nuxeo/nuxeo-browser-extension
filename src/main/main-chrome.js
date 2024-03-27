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

import ServiceWorker from './service-worker';

/* eslint-disable no-undef, no-restricted-globals */
const buildTime = import.meta.env.VITE_BUILD_TIMESTAMP;
const buildVersion = import.meta.env.VITE_BUILD_VERSION;
const browserVendor = import.meta.env.VITE_BROWSER_VENDOR;
const developmentMode = import.meta.env.VITE_DEVELOPMENT_MODE;

self.addEventListener('activate', new ServiceWorker(developmentMode, buildTime, buildVersion, browserVendor)
  .asPromise()
  .then((worker) => {
    console.log(`Service Worker: ${buildTime} - ${buildVersion} - ${browserVendor} - ${developmentMode}`);
    return worker;
  })
  .then((worker) => worker.activate(self)));
