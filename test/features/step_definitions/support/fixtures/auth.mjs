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

export async function login(username, password, button) {
  const usernameInput = await  browser.$('#username');
  const passwordInput = await browser.$('#password');
  const loginButton = await browser.$(button);

  // Wait for the username field to be displayed and interactable
  await usernameInput.waitForDisplayed();
  await usernameInput.waitForEnabled();

  // Wait for the password field to be displayed and interactable
  await passwordInput.waitForDisplayed();
  await passwordInput.waitForEnabled();

  // Set the values
  await usernameInput.setValue(username);
  await passwordInput.setValue(password);

  // Wait for the login button to be displayed and interactable
  await loginButton.waitForDisplayed();
  await loginButton.waitForEnabled();

  // Click the login button
  await loginButton.click();
}


export default login;