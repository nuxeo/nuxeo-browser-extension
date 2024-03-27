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

import login from './support/fixtures/auth.mjs';
import { findTabByTitle } from './support/fixtures/nav.mjs';
import { modifyDashboard, getDashboard } from './support/client.mjs';
import { After, AfterAll, Before } from './support/hooks.mjs';

const dashboardUrl = 'https://connect.nuxeo.com/nuxeo/site/studio/v2/project/bde-test/workspace/ws.resources/nuxeo.war/ui/nuxeo-home.html';

When(/^Designer Live Preview retrieves the modifications/, () => {
  const tabIds = browser.getWindowHandles();
  findTabByTitle('Nuxeo Dev Tools', tabIds);
  const isEnabled = browser.execute(() => window.isEnabled());
  const redirectedUrls = browser.execute(() => window.redirectedUrls);
  const dashboardModified = Object.values(redirectedUrls).indexOf(dashboardUrl) > -1;
  assert(isEnabled.should.be.true
    && redirectedUrls.should.not.be.empty
    && dashboardModified.should.be.true);
});

Then(/^my changes can be seen in the dashboard/, () => getDashboard(connectUsr, connectPsw)
  .then((dashboard) => assert(dashboard.indexOf('TESTING TESTING 123...') > -1)));
