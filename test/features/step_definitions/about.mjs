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

Then(/I see the version number/, () => {
  $('#version').waitForDisplayed();
  expect($('#version').getText().length).to.be.at.least(5);
});

Then(/the copyright is up-to-date/, () => {
  const date = new Date().getFullYear();
  $('#copyright').waitForDisplayed();
  expect(browser.$('#copyright').getText()).to.include(date);
});
