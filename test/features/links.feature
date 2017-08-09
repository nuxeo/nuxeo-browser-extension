Feature: Links

  Scenario Outline: Useful Links
    Given the Popup page is open
    When I hover on the Useful Links element
    Then I see the dropdown content element
    When I click on the <name> link
    Then the <title> page opens

    Examples:
      | name               | title                                                                              |
      | Explorer           | Nuxeo Platform Explorer                                                            |
      | NXQL               | NXQL \| Nuxeo Documentation                                                        |
      | EL Scripting       | Understand Expression and Scripting Languages Used in Nuxeo \| Nuxeo Documentation |
      | MVEL               | Use of MVEL in Automation Chains \| Nuxeo Documentation                            |
      | Workflow Variables | Variables Available in the Automation Context \| Nuxeo Documentation               |
      | Escalation Rules   | Escalation Service \| Nuxeo Documentation                                          |
      | Nuxeo Elements     | webcomponents.org - Discuss & share web components                                 |
      | Nuxeo Layouts      | Nuxeo Showcase - Layout Service (forms, views, and actions)                        |
      | Style Guide        | Nuxeo Platform - Style Guide                                                       |
  @watch
  Scenario: Studio button
    Given the Popup page is open
    # And I have a valid Studio project
    When I click on the Studio button