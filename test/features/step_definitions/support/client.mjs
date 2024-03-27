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
import Nuxeo from 'nuxeo';
import fs from 'fs';
import request from 'request-promise';

const nuxeo = new Nuxeo({
  baseURL: 'http://localhost:8080/nuxeo/',
  auth: {
    method: 'basic',
    username: 'Administrator',
    password: 'Administrator',
  },
});

const modifyOptions = (username, password) => ({
  url: 'https://connect.nuxeo.com/nuxeo/site/studio/v2/project/bde-test/workspace/ws.resources',
  method: 'POST',
  auth: {
    user: username,
    pass: password,
  },
  headers: {
    'Content-Type': 'multipart/form-data;',
    Accept: '*/*',
  },
  formData: {
    content: {
      value: fs.createReadStream(`${__dirname}/resources/nuxeo-home.html`),
      options: {
        filename: 'nuxeo-home.html',
        contentType: 'text/htme',
      },
    },
    path: '/nuxeo.war/ui/nuxeo-home.html',
  },
});

function modifyDashboard(username, password) {
  return request(modifyOptions(username, password))
    .then((res) => res)
    .catch((err) => {
      console.log(err.statusCode);
      console.log(err.error);
    });
}

// Revert any modifications made to Dashboard in Connect
const revertOptions = (username, password) => ({
  url: 'https://connect.nuxeo.com/nuxeo/site/studio/v2/project/bde-test/workspace/ws.resources/nuxeo.war/ui/nuxeo-home.html',
  method: 'DELETE',
  auth: {
    method: 'basic',
    user: username,
    pass: password,
  },
  headers: {
    Accept: '*/*',
  },
});

function revertDashboard(username, password) {
  return request(revertOptions(username, password))
    .then((res) => res)
    .catch((err) => {
      console.log(err.statusCode);
      console.log(err.error);
    });
}

const getDashboardOptions = (username, password) => ({
  url: 'https://connect.nuxeo.com/nuxeo/site/studio/v2/project/bde-test/workspace/ws.resources/nuxeo.war/ui/nuxeo-home.html',
  method: 'GET',
  auth: {
    method: 'basic',
    user: username,
    pass: password,
  },
  headers: {
    Accept: '*/*',
  },
});

function getDashboard(username, password) {
  return request(getDashboardOptions(username, password))
    .then((res) => res)
    .catch((err) => {
      console.log(err.statusCode);
      console.log(err.error);
    });
}

export {
  nuxeo,
  modifyDashboard,
  revertDashboard,
  getDashboard,
};
