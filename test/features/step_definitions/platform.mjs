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
import { assert, expect, should } from 'chai';

import { After } from './support/hooks.mjs';

When(/^I try to create a document/, () => {
  const el = $('html body nuxeo-app').shadow$('nuxeo-document-create-button').shadow$('#tray #createBtn');
  el.waitForExist(5000);
  el.click();
});

Then(/^I (can't )?see the (.+) document type/, (notVisible, docType) => {
  const el = $('html body nuxeo-app').shadow$('nuxeo-document-create-popup').shadow$('#createDocDialog');
  el.waitForExist(5000);
  const customDocType = $('html body nuxeo-app')
    .shadow$('nuxeo-document-create-popup')
    .shadow$('#createDocDialog #holder iron-pages #simpleCreation')
    .shadow$(`iron-pages .vertical .container paper-dialog-scrollable paper-button[name="${docType}"]`);
  if (notVisible) {
    expect(customDocType.elementId).to.equal(undefined);
    return expect(customDocType.error).to.exist;
  } else {
    expect(customDocType.elementId).to.exist;
    return expect(customDocType.error).to.equal(undefined);
  }
});

Then(/^the Nuxeo page refreshes/, () => {
  browser.waitUntil(() => browser.execute(() => chrome.tabs.reload.called), 50000);
  const tabIds = browser.getWindowHandles();
  for (let i = 0; i < tabIds.length; i += 1) {
    if (browser.getTitle().indexOf('Nuxeo Platform') === -1) {
      browser.switchToWindow(tabIds[i]);
    } else {
      return browser.refresh();
    }
  }
  return browser.refresh();
});
