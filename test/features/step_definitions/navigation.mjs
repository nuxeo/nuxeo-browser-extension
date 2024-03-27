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

import { create, init } from './support/fixtures/documents.mjs';
import { inject } from './support/fixtures/mocks.mjs';
import login from './support/fixtures/auth.mjs';
import { findTabByTitle, openNuxeo } from './support/fixtures/nav.mjs';
import { After } from './support/hooks.mjs';

const nxPath = 'http://localhost:8080/nuxeo';

Given(/^the (.+) page is open/, async (page) => {
  console.log(`Page: ${page}`);
  if (page == 'Popup extension') {
    let tabIds = await browser.getWindowHandles();
    if (tabIds.length === 1) {
      openNuxeo();
      await browser.pause(500);
      // Log in to Nuxeo
      login('Administrator', 'Administrator', 'input.login_button');
      await browser.pause(500);
      // Switch back to extension page
      findTabByTitle('Nuxeo Dev Tools', tabIds);
    }
  } else if (page === 'Studio') {
    let tabIds = await browser.getWindowHandles();
    if (tabIds.length > 1) {
      await browser.execute(() => {
        const url = 'https://connect.nuxeo.com/nuxeo/site/studio/ide?project=bde-test';
        window.open(url);
      });
      await browser.pause(500);
      tabIds = await browser.getWindowHandles();
      findTabByTitle('Welcome - Nuxeo • Connect – Customer Portal', tabIds);
    } else {
      const url = 'https://connect.nuxeo.com/nuxeo/site/studio/ide?project=bde-test';
      await browser.url(url);
    }
    expect(await browser.getTitle()).to.equal('Welcome - Nuxeo • Connect – Customer Portal');
  } else if (page === 'Nuxeo') {
    openNuxeo();
    const tabIds = await browser.getWindowHandles();
    findTabByTitle('Nuxeo Dev Tools', tabIds);
  } else {
    assert.fail([`"${page} page" unknown. See "navigation" step definition.`]);
  }
});

Then(/^I log into (.+)/, (page) => {
  if (page === 'Studio') {
    login(connectUsr, connectPsw, 'input.btn-submit');
    // Wait for stuff to happen in Studio so that HTTP calls pass
    browser.pause(8000);
    const title = browser.getTitle();
    expect(title.should.be.equal('Nuxeo Studio'));
  } else if (page === 'Nuxeo') {
    login('Administrator', 'Administrator', 'input.login_button');
  }
});

Then(/the (.+) page opens/, (titleToFind) => {
  const tabIds = browser.getWindowHandles();
  findTabByTitle(titleToFind, tabIds);
  return browser.getTitle().should.equal(titleToFind);
});

When(/I go to the (.+) page/, (page) => {
  const tabIds = browser.getWindowHandles();
  if (page === 'Popup extension') {
    page = 'Nuxeo Dev Tools';
  }
  findTabByTitle(page, tabIds);
  browser.refresh();
  expect(browser.getTitle()).to.include(page);
});

When(/I have a (.+) document in Nuxeo/, (docType) => {
  docType = docType || 'File';
  const doc = init(docType);
  return create('/default-domain/', doc).then((d) => {
    this.doc = d;
  });
});

When(/^I navigate to the document/, () => {
  browser.url(`${nxPath}/ui/#!/browse${this.doc.path}`);
});
