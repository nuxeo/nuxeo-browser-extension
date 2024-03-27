/*
Copyright 2016-2019 Nuxeo

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
import { nuxeo } from '../client.mjs';

let liveDocuments = [];

function init(docType) {
  const title = `My_${docType}`;
  const doc = {
    'entity-type': 'document',
    name: title.replace(/[^a-z0-9.]/gi, '_').toLowerCase(),
    type: docType.trim(),
    properties: {
      'dc:title': title,
    },
  };
  return doc;
}

function create(parent, document) {
  return nuxeo.repository()
    .create(parent, document)
    .then((doc) => {
      liveDocuments.push(doc.path);
      return doc;
    })
    .catch((e) => {
      console.log(e);
    });
}

export { init, create };