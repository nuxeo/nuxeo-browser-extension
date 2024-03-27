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
import { After } from './support/hooks.mjs';

function toggleTraces(button, page) {
  if (page === 'Popup extension') {
    const selector = button.replace(/\s+/g, '-').toLowerCase();
    browser.$(`#${selector}-button`).waitForDisplayed();
    browser.$(`#${selector}-button`).click();
  } else {
    browser.$('//a[@href="/nuxeo/site/automation/doc/toggleTraces"]').waitForDisplayed();
    browser.$('//a[@href="/nuxeo/site/automation/doc/toggleTraces"]').click();
  }
}

function tracesEnabled(button, page) {
  if (page === 'Popup extension') {
    browser.pause(500);
    const selector = button.replace(/\s+/g, '-').toLowerCase();
    browser.$(`#${selector}-button`).waitForDisplayed();
    const elementClass = browser.$(`#${selector}-button`).getAttribute('class');
    const enabled = elementClass.indexOf('enabled') > -1;
    if (enabled === true) {
      return true;
    } else {
      return false;
    }
  } else if (browser.$('a.button').getText() === 'Disable') {
    return true;
  } else if (browser.$('a.button').getText() === 'Enable') {
    return false;
  } else {
    return undefined;
  }
}

Then(/^I can see that (.+) (is|are) (enabled|disabled) on the (Automation Documentation|Popup extension) page/, (button, verb, mode, page) => {
  if (mode === 'enabled') {
    browser.waitUntil(() => tracesEnabled(button, page), 5000);
    return tracesEnabled(button, page).should.be.true;
  } else {
    browser.waitUntil(() => tracesEnabled(button, page) === false, 5000);
    return tracesEnabled(button, page).should.be.false;
  }
});

Then(/I click on the (.+) operation/, (operation) => {
  const tabIds = browser.getWindowHandles();
  browser.switchToWindow(tabIds[2]);
  browser.$(`//a[text()="${operation}"]`).waitForDisplayed;
  browser.$(`//a[text()="${operation}"]`).click();
});

When(/^(.+) (is|are) (enabled|disabled) from the (Automation Documentation|Popup extension) page$/, (button, verb, mode, page) => {
  if (mode === 'disabled') {
    if (tracesEnabled(button, page)) {
      return toggleTraces(button, page);
    }
    browser.waitUntil(() => tracesEnabled(button, page) === false, 5000);
    return tracesEnabled(button, page).should.be.false;
  } else {
    if (!tracesEnabled(button, page)) {
      return toggleTraces(button, page);
    }
    browser.waitUntil(() => tracesEnabled(button, page), 5000);
    return tracesEnabled(button, page).should.be.true;
  }
});
