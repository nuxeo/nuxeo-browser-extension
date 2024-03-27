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

import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from 'chai';
import Nuxeo from 'nuxeo';

import { After } from './support/hooks.mjs';

const nuxeo = new Nuxeo({
  baseURL: 'http://localhost:8080/nuxeo/',
  auth: {
    method: 'basic',
    username: 'Administrator',
    password: 'Administrator',
  },
});

Then(/I see the confirmation dialog/, () => {
  $('div.confirmation-modal').waitForDisplayed();
});

When(/I confirm the dialog/, () => {
  $('button.confirm').click();
});

Then(/the server restarts/, { timeout: 120000 }, () => {
  let connected = true;
  while (connected) {
    browser.pause(5000);
    nuxeo.connect()
      .then(async (client) => {
        connected = await client.connected;
      })
      .catch(() => {
        connected = false;
      });
  }
  while (!connected) {
    browser.pause(5000);
    nuxeo.connect()
      .then(async (client) => {
        connected = await client.connected;
      })
      .catch(() => {
        connected = false;
      });
  }
});

Then(/I can log back into Nuxeo/, () => {
  browser.setTimeout({
    implicit: 60000,
  });
  const tabIds = browser.getWindowHandles();
  browser.switchToWindow(tabIds[1]);
  browser.refresh();
  browser.$('#username').waitForDisplayed();
  browser.$('#username').addValue('Administrator');
  browser.$('#password').addValue('Administrator');
  browser.$('input.login_button').click();
  browser.switchToWindow(tabIds[0]);
  browser.refresh();
});
